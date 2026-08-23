// Claude/ChatGPT형 멀티턴 멀티에이전트 챗 — v2 리디자인 본체.
// 레거시 스타일에 의존하지 않고 theme.css 토큰만 사용한다.

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, parseMentions, routeQuestion } from "../../lib/agents.js";
import {
  AGENT_TRACE_STEPS,
  errorFromEvent,
  initialTraceSteps,
  normalizeSseEvent,
  reduceTraceEvent,
  buildRunFromResultEvent,
} from "../../lib/agentTrace.js";
import { SSE_ERROR_FALLBACK, openAgentStream } from "../../api/sseClient.js";
import { analysisFixtures } from "../../data/analysisFixtures.ts";
import {
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
  loadConversations,
  patchAssistantMessage,
  removeConversation,
} from "../../lib/conversations.js";

const ReportArtifact = lazy(() =>
  import("./ReportArtifact.jsx").then((m) => ({ default: m.ReportArtifact })),
);

const AGENT_HUES = Object.fromEntries(Object.entries(AGENTS).map(([id, a]) => [id, a.hue ?? 250]));
const SUGGESTIONS = [
  "지난주 객실 매출 추이를 보여줘",
  "이번 달 회원 등급별 분포를 비교해줘",
  "F&B 시간대별 매출 상위 메뉴는?",
  "연회 예약 취소 사유 요약해줘",
];

function relativeTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.floor(Math.max(0, Date.now() - t) / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return new Date(t).toISOString().slice(0, 10);
}

export function ChatApp() {
  const storage = typeof localStorage !== "undefined" ? localStorage : undefined;
  const initial = useMemo(() => loadConversations(storage), []);
  const [conversations, setConversations] = useState(initial);
  const [activeId, setActiveId] = useState(() => initial[0]?.id ?? null);
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const [draftText, setDraftText] = useState("");
  const [mentions, setMentions] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef(null);
  const activeIdRef = useRef(activeId);

  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active?.id]);

  useEffect(() => {
    try {
      localStorage.setItem("answervice.chat.conversations.v2", JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, phase]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
    stickToBottom.current = atBottom;
    el.dataset.showJump = String(!atBottom);
  };

  const jumpToBottom = () => {
    stickToBottom.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const newChat = useCallback(() => {
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setDraftText("");
    setMentions([]);
    setEditing(null);
    setArtifactOpen(false);
  }, []);

  const deleteChat = useCallback((id) => {
    setConversations((prev) => removeConversation(prev, id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const patchActive = useCallback((assistantId, patch) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeIdRef.current
          ? patchAssistantMessage(c, assistantId, patch, new Date().toISOString())
          : c,
      ),
    );
  }, []);

  const streamTurn = useCallback(
    async (working, question) => {
      const assistantId = working.messages.at(-1).id;
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === working.id);
        return exists
          ? prev.map((c) => (c.id === working.id ? working : c))
          : [working, ...prev];
      });
      setActiveId(working.id);
      activeIdRef.current = working.id;
      setPhase("streaming");
      stickToBottom.current = true;

      let steps = working.messages.at(-1).steps;
      let settled = false;
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const finishWithRun = (run) => {
        settled = true;
        steps = AGENT_TRACE_STEPS.map(() => ({ status: "done" }));
        patchActive(assistantId, {
          steps: [...steps],
          result: run,
          body: String(run.summary ?? "분석이 완료되었습니다."),
          streaming: false,
          reportReady: true,
        });
        setArtifactOpen(true);
      };

      const onFrame = (frame) => {
        const event =
          frame && typeof frame.data === "object" && frame.data.type ? frame.data : normalizeSseEvent(frame);
        if (!event?.type) return;
        if (event.type === "trace") {
          steps = reduceTraceEvent(steps, event);
          patchActive(assistantId, { steps: [...steps] });
        } else if (event.type === "result") {
          finishWithRun(buildRunFromResultEvent(event));
        } else if (event.type === "error") {
          settled = true;
          const err = errorFromEvent(event);
          steps = reduceTraceEvent(steps, { type: "error", step: event.step });
          patchActive(assistantId, {
            steps: [...steps],
            streaming: false,
            error: err.message ?? "분석에 실패했습니다.",
          });
        }
      };

      const fixtureWalk = async () => {
        for (let i = 1; i <= AGENT_TRACE_STEPS.length; i += 1) {
          if (signal.aborted) throw new DOMException("aborted", "AbortError");
          steps = reduceTraceEvent(steps, { type: "trace", step: i, status: "running" });
          patchActive(assistantId, { steps: [...steps] });
          await sleep(70, signal);
          steps = reduceTraceEvent(steps, { type: "trace", step: i, status: "done" });
          patchActive(assistantId, { steps: [...steps] });
        }
        await sleep(100, signal);
        finishWithRun(analysisFixtures.ready);
      };

      try {
        for await (const frame of openAgentStream({
          question,
          conversationId: working.id,
          signal,
          onFrame,
        })) {
          onFrame(frame);
        }
        if (!settled) throw new Error(SSE_ERROR_FALLBACK);
      } catch (error) {
        if (signal.aborted || error?.name === "AbortError") {
          patchActive(assistantId, { streaming: false, stopped: true, steps: [...steps] });
        } else {
          try {
            await fixtureWalk();
          } catch (inner) {
            if (inner?.name === "AbortError" || signal.aborted) {
              patchActive(assistantId, { streaming: false, stopped: true, steps: [...steps] });
            } else {
              patchActive(assistantId, {
                streaming: false,
                error: "지금은 분석 엔진에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
              });
            }
          }
        }
      } finally {
        abortRef.current = null;
        setPhase("idle");
      }
    },
    [patchActive],
  );

  const send = useCallback(
    (text) => {
      const question = String(text ?? "").trim();
      if (!question || phase !== "idle") return;

      let base = conversations.find((c) => c.id === activeIdRef.current) ?? null;
      let isNew = false;
      if (!base) {
        base = createConversation();
        isNew = true;
      }
      const mentioned = parseMentions(question);
      const targets = [...new Set(mentioned.length ? mentioned : routeQuestion(question).targets)];
      const now = new Date().toISOString();

      let working = appendUserMessage(base, question, now);
      working = appendAssistantMessage(
        working,
        { agents: ["coordinator", ...targets.filter((t) => t !== "coordinator")], steps: initialTraceSteps() },
        now,
      );
      setDraftText("");
      setMentions([]);
      setEditing(null);
      void streamTurn(working, question);
    },
    [conversations, phase, streamTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    if (phase !== "idle" || !active) return;
    const msgs = active.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const question = msgs[lastUserIdx].text;
    const kept = msgs.slice(0, lastUserIdx + 1);
    const targets = [...new Set(parseMentions(question).length ? parseMentions(question) : routeQuestion(question).targets)];
    const now = new Date().toISOString();
    const working = {
      ...active,
      messages: [
        ...kept,
        {
          id: `a_${Math.random().toString(36).slice(2)}`,
          role: "assistant",
          agents: ["coordinator", ...targets.filter((t) => t !== "coordinator")],
          body: "",
          steps: initialTraceSteps(),
          result: null,
          reportReady: false,
          streaming: true,
          at: now,
        },
      ],
      updatedAt: now,
    };
    void streamTurn(working, question);
  }, [active, phase, streamTurn]);

  const beginEdit = useCallback(
    (messageId) => {
      const msg = active?.messages.find((m) => m.id === messageId);
      if (!msg || msg.role !== "user" || phase !== "idle") return;
      setEditing({ messageId });
      setDraftText(msg.text);
      setMentions(parseMentions(msg.text));
    },
    [active, phase],
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setDraftText("");
  }, []);

  const submitEdit = useCallback(() => {
    const newText = draftText.trim();
    if (!editing || !newText || phase !== "idle" || !active) return;
    const idx = active.messages.findIndex((m) => m.id === editing.messageId);
    if (idx === -1) { cancelEdit(); return; }
    const mentioned = parseMentions(newText);
    const targets = [...new Set(mentioned.length ? mentioned : routeQuestion(newText).targets)];
    const now = new Date().toISOString();
    const working = {
      ...active,
      messages: [
        ...active.messages.slice(0, idx),
        { id: `m_${Math.random().toString(36).slice(2)}`, role: "user", text: newText, at: now },
        {
          id: `a_${Math.random().toString(36).slice(2)}`,
          role: "assistant",
          agents: ["coordinator", ...targets.filter((t) => t !== "coordinator")],
          body: "", steps: initialTraceSteps(), result: null, reportReady: false, streaming: true,
          at: now,
        },
      ],
      updatedAt: now,
    };
    setEditing(null);
    setDraftText("");
    void streamTurn(working, newText);
  }, [active, draftText, editing, phase, streamTurn]);

  const lastReportMessage = useMemo(() => {
    if (!active) return null;
    for (let i = active.messages.length - 1; i >= 0; i -= 1) {
      const m = active.messages[i];
      if (m.role === "assistant" && m.reportReady && m.result) return m;
    }
    return null;
  }, [active]);

  const canRegenerate = Boolean(active && phase === "idle" && active.messages.some((m) => m.role === "assistant"));
  const lastAssistant = canRegenerate ? lastAssistantId(active) : null;

  return (
    <div className={`chat-app${artifactOpen && lastReportMessage ? " chat-app--artifact" : ""}`} data-stream={phase}>
      <aside className="rail">
        <div className="rail__top">
          <div className="rail__brand"><span className="rail__brand-mark">AS</span>ANSWERVICE</div>
          <button className="btn-newchat" onClick={newChat}><PlusIcon /> 새 채팅</button>
          <input className="rail__search" placeholder="대화 검색" aria-label="대화 검색" readOnly />
          <div className="rail__label">최근 대화</div>
        </div>
        <div className="rail__list">
          {[...conversations]
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
            .map((c) => (
              <div key={c.id} className="conv-item-row">
                <button className="conv-item" aria-current={c.id === activeId}
                  onClick={() => { setActiveId(c.id); setArtifactOpen(false); }}>
                  <span className="conv-item__title">{c.title}</span>
                  <span className="conv-item__meta">{relativeTime(c.updatedAt)} · 메시지 {c.messages.length}</span>
                </button>
                <button className="conv-item__delete" aria-label={`${c.title} 삭제`}
                  onClick={() => deleteChat(c.id)}>✕</button>
              </div>
            ))}
          {conversations.length === 0 && <p className="doc-empty">아직 대화가 없습니다</p>}
        </div>
        <div className="rail__foot">
          <span className="rail__org-badge">A</span>
          <div className="rail__org"><b>Sense Place Hotel</b><small>Demo · 합성 데이터</small></div>
        </div>
      </aside>

      <section className="thread-pane" aria-label="분석 채팅">
        {!active || active.messages.length === 0 ? (
          <EmptyState onPick={(text) => send(text)} />
        ) : (
          <div className="thread-scroll" ref={scrollRef} onScroll={handleScroll}>
            <div className="thread-inner">
              {active.messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="turn-user-group">
                    <div className="turn-user">{m.text}</div>
                    <div className="turn-user__actions">
                      <button onClick={() => beginEdit(m.id)}>편집</button>
                      <button onClick={() => navigator.clipboard?.writeText(m.text)}>복사</button>
                    </div>
                  </div>
                ) : (
                  <AssistantTurn key={m.id} message={m}
                    onOpenArtifact={() => setArtifactOpen(true)}
                    onRegenerate={m.id === lastAssistant ? regenerate : undefined} />
                ),
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        <button className="scroll-jump" onClick={jumpToBottom} aria-label="맨 아래로 이동">↓</button>

        <ComposerWrap
          value={draftText}
          onChange={setDraftText}
          mentions={mentions}
          onMentionsChange={setMentions}
          onSubmit={() => (editing ? submitEdit() : send(draftText))}
          onCancelEdit={editing ? cancelEdit : undefined}
          busy={phase !== "idle"}
          onStop={stop}
        />
      </section>

      {artifactOpen && lastReportMessage && (
        <Suspense fallback={<aside className="artifact-drawer"><p className="doc-empty">리포트 준비 중…</p></aside>}>
          <ReportArtifact message={lastReportMessage} onClose={() => setArtifactOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function lastAssistantId(conv) {
  for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
    if (conv.messages[i].role === "assistant") return conv.messages[i].id;
  }
  return null;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}

function EmptyState({ onPick }) {
  return (
    <div className="thread-scroll">
      <div className="thread-empty">
        <h1>무엇이든 물어보세요</h1>
        <p>승인된 운영 데이터를 대상으로 근거가 있는 분석을 제공합니다.</p>
        <div className="suggestions">
          {SUGGESTIONS.map((text) => (
            <button key={text} className="suggestion" onClick={() => onPick(text)}>{text}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssistantTurn({ message, onOpenArtifact, onRegenerate }) {
  const [openSteps, setOpenSteps] = useState(message.streaming);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!message.streaming) setOpenSteps(false);
  }, [message.streaming]);

  const primary = message.agents.find((id) => AGENTS[id]) ?? "analyst";

  return (
    <div className="turn-assistant" style={{ "--agent-hue": AGENT_HUES[primary] }}>
      <div className="turn-assistant__head">
        <span className="agent-dot" />
        {(message.agents.length ? message.agents : ["analyst"]).map((id) => AGENTS[id]?.name ?? id).join(" · ")}
        {message.streaming && <em className="streaming-tag">분석 중…</em>}
        {message.stopped && <em className="stopped-tag">중단됨</em>}
      </div>

      {message.steps && (
        <>
          <button type="button"
            className={`verify-chip${message.streaming ? " verify-chip--running" : ""}`}
            aria-expanded={openSteps}
            onClick={() => setOpenSteps((v) => !v)}>
            {message.streaming
              ? "검증 진행 중"
              : `${AGENT_TRACE_STEPS.filter((_, i) => message.steps[i]?.status === "done").length}/7 검증 완료 ▾`}
          </button>
          {openSteps && (
            <ol className="verify-steps">
              {AGENT_TRACE_STEPS.map((step, i) => {
                const st = message.steps[i]?.status ?? "idle";
                return (
                  <li key={step.label}>
                    <span className={`step-dot step-dot--${st}`} />
                    {step.label}
                    <small>{st === "done" ? "완료" : st === "running" ? "실행 중" : st === "blocked" ? "보류" : st === "failed" ? "실패" : "대기"}</small>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      {message.error && <p style={{ margin: 0, color: "var(--c-danger)", fontSize: 14 }}>{message.error}</p>}
      {(message.body || message.streaming) && (
        <div className={`turn-assistant__body${message.streaming ? " turn-assistant__streaming" : ""}`}>
          {message.body || ""}
        </div>
      )}
      {!message.streaming && !message.body && !message.error && (
        <div className="turn-assistant__body">요청을 처리했습니다.</div>
      )}

      {message.result && <ResultBlock run={message.result} />}

      {!message.streaming && (
        <div className="msg-actions">
          {message.reportReady && <button type="button" onClick={onOpenArtifact}>리포트로 정리</button>}
          {message.body && (
            <button type="button" onClick={(e) => {
              navigator.clipboard?.writeText(message.body ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}>{copied ? "복사됨" : "복사"}</button>
          )}
          {onRegenerate && !message.error && <button type="button" onClick={onRegenerate}>다시 생성</button>}
        </div>
      )}
    </div>
  );
}

function ResultBlock({ run }) {
  const metrics = Array.isArray(run.metrics) ? run.metrics : [];
  const table = run.table && Array.isArray(run.table.rows) ? run.table : null;
  return (
    <div className="result-block">
      <div className="kpi-row">
        {metrics.slice(0, 4).map((m, idx) => (
          <div className="kpi" key={m.metric_id ?? `${m.label}-${idx}`}>
            <small>{m.label ?? m.metric_id}</small>
            <strong>{formatValue(m.value)}{m.unit ? ` ${m.unit}` : ""}</strong>
          </div>
        ))}
      </div>
      {table && table.rows.length > 0 && (
        <table className="data-table">
          <thead><tr>{table.columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
          <tbody>
            {table.rows.slice(0, 8).map((row, i) => (
              <tr key={i}>{table.columns.map((col) => <td key={col}>{String(row[col] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatValue(value) {
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  return String(value ?? "");
}

function ComposerWrap({ value, onChange, mentions, onMentionsChange, onSubmit, onCancelEdit, busy, onStop }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const areaRef = useRef(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const submit = () => {
    if (busy || !value.trim()) return;
    onSubmit();
    if (areaRef.current) areaRef.current.style.height = "auto";
  };

  const pick = (id) => {
    if (mentions.includes(id)) return;
    onMentionsChange([...mentions, id]);
    setMenuOpen(false);
    areaRef.current?.focus();
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {(mentions.length > 0 || onCancelEdit) && (
          <div className="composer__chips">
            {onCancelEdit && (
              <span className="chip-agent chip-agent--editing">
                ✎ 메시지 수정 중
                <button type="button" onClick={onCancelEdit}>취소</button>
              </span>
            )}
            {mentions.map((id) => (
              <span className="chip-agent" key={id}>
                <span className="agent-dot" style={{ "--agent-hue": AGENT_HUES[id] }} />
                {AGENTS[id]?.name ?? id}
                <button type="button" aria-label={`${AGENTS[id]?.name ?? id} 제거`}
                  onClick={() => onMentionsChange(mentions.filter((x) => x !== id))}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="composer__row" style={{ position: "relative" }}>
          <button type="button" className="composer__agent-btn" aria-haspopup="listbox" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}>@ 에이전트</button>
          {menuOpen && (
            <div className="agent-menu" role="listbox">
              {Object.entries(AGENTS).map(([id, agent]) => (
                <button key={id} role="option" aria-selected="false" className="agent-menu__item" type="button"
                  onClick={() => pick(id)}>
                  <span className="agent-dot" style={{ "--agent-hue": agent.hue ?? 250 }} />
                  <span><b>{agent.name}</b><small>{agent.role}</small></span>
                </button>
              ))}
            </div>
          )}
          <textarea ref={areaRef} rows={1} value={value}
            placeholder="질문을 입력하세요 (@로 에이전트 지정, Enter 전송)"
            aria-label="분석 질문"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {busy ? (
            <button className="composer__send composer__send--stop" onClick={onStop} aria-label="중단"><StopIcon /></button>
          ) : (
            <button className="composer__send" disabled={!value.trim()} onClick={submit} aria-label="전송">↑</button>
          )}
        </div>
      </div>
      <p className="composer__hint">Enter 전송 · Shift+Enter 줄바꿈 · 응답은 승인된 합성 데이터 기준으로 검증됩니다</p>
    </div>
  );
}

function StopIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>;
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
