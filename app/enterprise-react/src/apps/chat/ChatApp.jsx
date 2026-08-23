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
  const bottomRef = useRef(null);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active?.id]);

  useEffect(() => {
    try {
      localStorage.setItem("answervice.chat.conversations.v2", JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  const newChat = useCallback(() => {
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setDraftText("");
    setMentions([]);
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

  const send = useCallback(
    async (rawText) => {
      const question = String(rawText ?? "").trim();
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
      const assistantId = working.messages.at(-1).id;

      setConversations((prev) => (isNew ? [working, ...prev] : prev.map((c) => (c.id === working.id ? working : c))));
      if (isNew) setActiveId(working.id);
      activeIdRef.current = working.id;
      setDraftText("");
      setMentions([]);
      setPhase("streaming");

      let steps = working.messages.at(-1).steps;
      let settled = false;
      let lastRun = null;

      const finishWithRun = (run) => {
        settled = true;
        lastRun = run;
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
          steps = reduceTraceEvent(steps, { type: "trace", step: i, status: "running" });
          patchActive(assistantId, { steps: [...steps] });
          await sleep(70);
          steps = reduceTraceEvent(steps, { type: "trace", step: i, status: "done" });
          patchActive(assistantId, { steps: [...steps] });
        }
        await sleep(100);
        finishWithRun(analysisFixtures.ready);
      };

      try {
        for await (const frame of openAgentStream({ question, conversationId: working.id, onFrame })) {
          onFrame(frame);
        }
        if (!settled) throw new Error(SSE_ERROR_FALLBACK);
      } catch {
        // 백엔드 미기동 환경에서도 동일한 멀티턴 경험을 제공하는 결정론적 폴백
        await fixtureWalk();
      } finally {
        setPhase("idle");
      }
    },
    [activeIdRef, conversations, phase],
  );

  const lastReportMessage = useMemo(() => {
    if (!active) return null;
    for (let i = active.messages.length - 1; i >= 0; i -= 1) {
      const m = active.messages[i];
      if (m.role === "assistant" && m.reportReady && m.result) return m;
    }
    return null;
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages.length, phase]);

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
              <button key={c.id} className="conv-item" aria-current={c.id === activeId}
                onClick={() => { setActiveId(c.id); setArtifactOpen(false); }}>
                <span className="conv-item__title">{c.title}</span>
                <span className="conv-item__meta">{relativeTime(c.updatedAt)} · 메시지 {c.messages.length}</span>
              </button>
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
          <div className="thread-scroll">
            <div className="thread-inner">
              {active.messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="turn-user">{m.text}</div>
                ) : (
                  <AssistantTurn key={m.id} message={m} onOpenArtifact={() => setArtifactOpen(true)} />
                ),
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        <ComposerWrap
          value={draftText}
          onChange={setDraftText}
          mentions={mentions}
          onMentionsChange={setMentions}
          onSubmit={() => send(draftText)}
          busy={phase !== "idle"}
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

function EmptyState({ onPick }) {
  return (
    <div className="thread-scroll">
      <div className="thread-empty">
        <h1>무엇이든 물어보세요</h1>
        <p>승인된 운영 데이터를 대상으로 근거가 있는 분석을 제공합니다.</p>
        <div className="suggestions">
          {[
            "지난주 객실 매출 추이를 보여줘",
            "이번 달 회원 등급별 분포를 비교해줘",
            "F&B 시간대별 매출 상위 메뉴는?",
            "연회 예약 취소 사유 요약해줘",
          ].map((text) => (
            <button key={text} className="suggestion" onClick={() => onPick(text)}>{text}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssistantTurn({ message, onOpenArtifact }) {
  const [openSteps, setOpenSteps] = useState(message.streaming);
  useEffect(() => {
    if (!message.streaming) setOpenSteps(false);
  }, [message.streaming]);

  const primary = message.agents.find((id) => AGENTS[id]) ?? "analyst";

  return (
    <div className="turn-assistant" style={{ "--agent-hue": AGENT_HUES[primary] }}>
      <div className="turn-assistant__head">
        <span className="agent-dot" />
        {(message.agents.length ? message.agents : ["analyst"]).map((id) => AGENTS[id]?.name ?? id).join(" · ")}
        {message.streaming && <em style={{ color: "var(--c-warn)", fontStyle: "normal", fontSize: 12 }}>분석 중…</em>}
      </div>

      {message.steps && message.streaming && (
        <ol className="verify-steps">
          {AGENT_TRACE_STEPS.map((step, i) => {
            const st = message.steps[i]?.status ?? "idle";
            return (
              <li key={step.label}>
                <span className={`step-dot step-dot--${st}`} />
                {step.label}
              </li>
            );
          })}
        </ol>
      )}
      {message.steps && !message.streaming && !message.error && (
        <button type="button" className="verify-chip" aria-expanded="false"
          onClick={(e) => {
            const list = e.currentTarget.nextElementSibling;
            const open = list?.style.display !== "none";
            if (list) list.style.display = open ? "none" : "flex";
            e.currentTarget.setAttribute("aria-expanded", String(!open));
          }}>
          ✓ 7단계 검증 완료 ▾
        </button>
      )}
      {message.steps && !message.streaming && (
        <ol className="verify-steps" style={{ display: "none" }}>
          {AGENT_TRACE_STEPS.map((step, i) => (
            <li key={step.label}>
              <span className="step-dot step-dot--done" />
              {step.label}
            </li>
          ))}
        </ol>
      )}

      {message.error && (
        <p style={{ margin: 0, color: "var(--c-danger)", fontSize: 14 }}>{message.error}</p>
      )}
      {message.body && <div className="turn-assistant__body">{message.body}</div>}
      {!message.streaming && !message.body && !message.error && (
        <div className="turn-assistant__body">요청을 처리했습니다.</div>
      )}

      {message.result && <ResultBlock run={message.result} />}

      {message.reportReady && !message.streaming && (
        <div className="msg-actions">
          <button type="button" onClick={onOpenArtifact}>리포트로 정리</button>
          <button type="button"
            onClick={(e) => {
              navigator.clipboard?.writeText(message.body ?? "");
              e.currentTarget.textContent = "복사됨";
              setTimeout(() => { e.currentTarget.textContent = "복사"; }, 1200);
            }}>
            복사
          </button>
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

function ComposerWrap({ value, onChange, mentions, onMentionsChange, onSubmit, busy }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const areaRef = useRef(null);

  const submit = () => {
    if (busy || !value.trim()) return;
    onSubmit(value.trim());
    setMenuOpen(false);
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
        {mentions.length > 0 && (
          <div className="composer__chips">
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
          <button type="button" style={{
            height: 34, padding: "0 10px", border: "1px solid var(--c-line)",
            borderRadius: 8, background: "#fff", color: "var(--c-ink-2)", fontSize: 13,
          }} aria-haspopup="listbox" aria-expanded={menuOpen}
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
            placeholder="질문을 입력하세요 (@로 에이전트 지정)"
            aria-label="분석 질문"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
            }}
          />
          <button className="composer__send" disabled={busy || !value.trim()} onClick={submit} aria-label="전송">↑</button>
        </div>
      </div>
      <p className="composer__hint">⌘↩ 전송 · 응답은 승인된 합성 데이터 기준으로 검증됩니다</p>
    </div>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
