import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileBarChart, MessageSquareText, Sparkles } from "lucide-react";
import { createMockAnalysisClient } from "../api/analysisClient";
import { openAgentStream, SSE_ERROR_FALLBACK } from "../api/sseClient";
import { ChatComposer } from "../components/agent/ChatComposer";
import { ResultCard } from "../components/agent/ResultCard";
import { TraceSteps } from "../components/agent/TraceSteps";
import { ArtifactPanel } from "../components/agent/ArtifactPanel";
import { useAgentRuntime } from "../components/agent/agentRuntimeContext";
import { DelegationCard, MessageBubble } from "../components/agent/MessageBubble";
import { AgentEmptyState } from "../components/agent/AgentEmptyState";
import { AgentErrorState } from "../components/agent/AgentErrorState";
import { ResultCardSkeleton, TypingDots } from "../components/agent/AgentSkeleton";
import { TrustRow } from "../components/agent/TrustRow";
import { MetaStrip } from "../components/common/EnterpriseUi";
import { PAGE_PATHS, resolveRoute } from "../routing";
import { analysisFixtures } from "../data/analysisFixtures";
import { createUuid } from "../utils/createUuid";
import {
  AGENT_TRACE_STEPS,
  buildRunFromResultEvent,
  initialTraceSteps,
  normalizeSseEvent,
  reduceTraceEvent,
  TRACE_STATUS,
} from "../lib/agentTrace";
import { AGENT_LIST, parseMentions, routeQuestion } from "../lib/agents";
import { buildDraftGrid, presentViewState } from "../lib/reportBridge";
import {
  clearStoredDraft,
  readStoredDraft,
  stageArtifact,
} from "../lib/artifactStore";
import { createReportRun } from "../contracts/report";

// Code-split the assistant-ui runtime bridge. lazyAgentRuntime.js already
// wraps the provider in React.lazy — importing it directly keeps a single
// lazy boundary; wrapping again would hand React a promise of a lazy object.
import { LazyAgentRuntimeProvider } from "../components/agent/lazyAgentRuntime.js";

function AgentRuntimeSuspense({ children }) {
  // No visible fallback — the runtime bubble is hidden via CSS so the user
  // only ever sees the page's own chat shell. Keeping a React-rendered
  // placeholder here would add nothing to first paint.
  return <Suspense fallback={null}>{children}</Suspense>;
}

const SIDE_NAV_ITEMS = [
  { id: "chat", path: PAGE_PATHS.chat, label: "분석 챗", icon: MessageSquareText },
  { id: "reports", path: PAGE_PATHS.reports, label: "보고서", icon: FileBarChart },
  { id: "catalog", path: PAGE_PATHS.catalog, label: "DataHub 카탈로그", icon: BookOpen },
];

const mockClient = createMockAnalysisClient();
const STEP_DURATION_MS = 120;
const EMPTY_STATE_AS_OF = "2026-07-30";

function safeNavigate(targetPath) {
  if (!targetPath) return;
  const nextRoute = resolveRoute(targetPath);
  if (typeof window === "undefined") return;
  window.history.pushState({}, "", nextRoute.path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function makeMessage(partial) {
  return {
    id: createUuid(),
    author: "agent",
    agents: [],
    kind: "text",
    status: "ready",
    ...partial,
  };
}

function summarizeQuestion(question) {
  if (typeof question !== "string" || !question.trim()) return "";
  return question.length > 60 ? `${question.slice(0, 57)}…` : question;
}

function pageMessagesToRuntime(messages) {
  if (!Array.isArray(messages)) return undefined;
  const out = [];
  for (const message of messages) {
    if (message.author === "user") {
      out.push({
        role: "user",
        content: [{ type: "text", text: typeof message.body === "string" ? message.body : "" }],
      });
    } else if (message.kind === "result" && message.run) {
      const summary = message.run.summary ?? "분석이 완료되었습니다.";
      out.push({
        role: "assistant",
        content: [{ type: "text", text: String(summary) }],
      });
    } else if (message.kind === "delegation") {
      out.push({
        role: "assistant",
        content: [{ type: "text", text: `위임: ${message.delegation?.summary ?? "…"}` }],
      });
    }
  }
  return out.length ? out : undefined;
}

function resolveErrorViewState(viewState, error) {
  if (viewState === "FORBIDDEN"
    || viewState === "INSUFFICIENT_EVIDENCE"
    || viewState === "PARTIAL"
    || viewState === "CANCELLED"
    || viewState === "EMPTY"
    || viewState === "ERROR") {
    return viewState;
  }
  if (error?.code === "ACCESS_DENIED") return "FORBIDDEN";
  if (error?.code === "RESULT_EVIDENCE_MISSING" || error?.code === "INSUFFICIENT_EVIDENCE") {
    return "INSUFFICIENT_EVIDENCE";
  }
  return "ERROR";
}

export function AgentPage() {
  const conversationIdRef = useRef(createUuid());
  const conversationId = conversationIdRef.current;
  const [question, setQuestion] = useState("");
  const [mentions, setMentions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [traceSteps, setTraceSteps] = useState(() => initialTraceSteps());
  const [draft, setDraft] = useState(() => readStoredDraft() ?? null);
  const [reportRun, setReportRun] = useState(null);
  const [artifactNotice, setArtifactNotice] = useState("");
  const [streamMode, setStreamMode] = useState("mock");
  const [collapsed, setCollapsed] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [errorState, setErrorState] = useState(null);

  const env = typeof import.meta !== "undefined" ? import.meta.env ?? {} : {};
  const sseBaseUrl = env.VITE_AGENT_STREAM_URL || "http://127.0.0.1:18000";
  const preferHttp = Boolean(env.VITE_ANALYSIS_MODE && env.VITE_ANALYSIS_MODE !== "mock");

  const { sendUserMessage } = useAgentRuntime();

  const grid = useMemo(() => buildDraftGrid(draft?.blocks ?? []), [draft]);
  const viewState = useMemo(() => {
    if (!hasSubmitted) return "READY";
    if (submitting) return "LOADING";
    const last = [...messages].reverse().find((message) => message.kind === "result" || message.kind === "trace");
    return last?.viewState ?? "LOADING";
  }, [hasSubmitted, submitting, messages]);
  const presentation = useMemo(() => presentViewState(viewState), [viewState]);
  const runtimeInitialMessages = useMemo(() => pageMessagesToRuntime(messages), [messages]);

  useEffect(() => {
    if (!artifactNotice) return undefined;
    const handle = window.setTimeout(() => setArtifactNotice(""), 1800);
    return () => window.clearTimeout(handle);
  }, [artifactNotice]);

  const handleAddToReport = () => {
    const lastResult = [...messages].reverse().find((message) => message.kind === "result");
    if (!lastResult?.run?.artifact?.artifactId) return;
    const next = stageArtifact(lastResult.run, { title: `${lastResult.run.question || "분석"} · 자동 보고서` });
    setDraft(next.draft);
    setReportRun(null);
    setArtifactNotice(`Artifact ${lastResult.run.artifact.artifactId}를 보고서 초안 후보로 선택했습니다.`);
  };

  const handleCreateRun = () => {
    if (!draft) return;
    const lastResult = [...messages].reverse().find((message) => message.kind === "result");
    const run = createReportRun({
      runId: `run-${createUuid()}`,
      definitionId: draft.definitionId,
      definitionVersion: draft.version,
      asOf: `${EMPTY_STATE_AS_OF}T12:00:00+09:00`,
      policyVersion: "policy-v1",
      contextHash: lastResult?.run?.artifact?.contextHash ?? lastResult?.run?.artifact?.artifactId ?? "—",
      watermark: { pms: "2026-07-28T05:00:00.000Z" },
      status: "queued",
      blocks: draft.blocks.map((block) => ({
        blockId: block.id,
        artifactId: block.artifactId,
        queryId: block.queryId ?? lastResult?.run?.artifact?.queryId ?? "—",
        snapshotChecksum: block.artifactId ?? "—",
        status: "success",
      })),
    });
    setReportRun(run);
    setArtifactNotice(`실행 기록 ${run.runId} 생성`);
  };

  const handleClearDraft = () => {
    clearStoredDraft();
    setDraft(null);
    setReportRun(null);
    setArtifactNotice("초안 후보를 초기화했습니다.");
  };

  const handleToggleCollapsed = () => setCollapsed((current) => !current);

  const handleRuntimeFrame = useCallback((frame) => {
    if (!frame || typeof frame !== "object") return;
    const payload = frame.data ?? {};
    const normalized = normalizeSseEvent({
      type: typeof frame.event === "string" && frame.event !== "message" ? frame.event : payload.type,
      ...payload,
    });
    if (!normalized) return;
    if (normalized.type === "trace") {
      setTraceSteps((prev) => reduceTraceEvent(prev, { type: "trace", ...normalized }));
    } else if (normalized.type === "result") {
      setTraceSteps((prev) => reduceTraceEvent(prev, { type: "result", ...normalized }));
      const traceMessage = messages.find((m) => m.kind === "trace");
      const finalizedRun = buildRunFromResultEvent(normalized, traceMessage?.run ?? analysisFixtures.ready);
      setMessages((current) => [
        ...current,
        makeMessage({
          author: "agent",
          agents: ["analyst"],
          kind: "result",
          run: finalizedRun,
          status: "done",
          viewState: "READY",
        }),
        makeMessage({
          author: "agent",
          agents: ["reporter"],
          kind: "text",
          body: "결과를 보고서 초안으로 정리할 수 있어요. 오른쪽 Artifacts 패널에서 '보고서에 담기'를 누르세요.",
          status: "ready",
          actions: [{ id: "add", label: "보고서에 담기", onSelect: handleAddToReport }],
        }),
      ]);
    } else if (normalized.type === "error") {
      setTraceSteps((prev) => reduceTraceEvent(prev, { type: "error", ...normalized }));
    } else if (normalized.type === "done") {
      setTraceSteps((prev) => reduceTraceEvent(prev, { type: "done", duration_ms: normalized.durationMs }));
    }
  }, [messages]);

  const updateMessage = (id, patch) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch } : message)));
  };

  const playFixtureFlow = async (nextQuestion, routing, delegationId) => {
    setStreamMode("mock");
    setTraceSteps(initialTraceSteps().map((step) => step.id === 1 ? { ...step, status: TRACE_STATUS.RUNNING } : step));
    const delegateIds = routing.targets.filter((id) => id !== "coordinator");
    if (delegationId) updateMessage(delegationId, { status: "running", viewState: "LOADING" });

    for (let index = 1; index <= AGENT_TRACE_STEPS.length; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, STEP_DURATION_MS));
      setTraceSteps((prev) => reduceTraceEvent(prev, { type: "trace", step: index, status: "running" }));
    }
    const result = await mockClient.analyze(nextQuestion, conversationId, "ready");
    setTraceSteps((prev) => reduceTraceEvent(prev, { type: "result", artifact_id: result.artifact?.artifactId }));
    setMessages((current) => [
      ...current,
      makeMessage({
        author: "agent",
        agents: delegateIds.length ? delegateIds : ["analyst"],
        kind: "result",
        run: result,
        status: "done",
        viewState: "READY",
      }),
      makeMessage({
        author: "agent",
        agents: ["reporter"],
        kind: "text",
        body: "결과를 보고서 초안으로 정리할 수 있어요. 오른쪽 Artifacts 패널에서 '보고서에 담기'를 누르세요.",
        status: "ready",
        actions: [{ id: "add", label: "보고서에 담기", onSelect: handleAddToReport }],
      }),
    ]);
    if (delegationId) updateMessage(delegationId, { status: "done" });
  };

  const playStreamFlow = async (nextQuestion, routing, delegationId) => {
    try {
      setStreamMode("http");
      setTraceSteps(initialTraceSteps().map((step) => step.id === 1 ? { ...step, status: TRACE_STATUS.RUNNING } : step));
      if (delegationId) updateMessage(delegationId, { status: "running", viewState: "LOADING" });
      const stream = openAgentStream({
        baseUrl: sseBaseUrl,
        body: { question: nextQuestion, conversation_id: conversationId },
      });
      for await (const frame of stream) {
        handleRuntimeFrame(frame);
      }
      if (delegationId) updateMessage(delegationId, { status: "done" });
    } catch (error) {
      if (error?.message === SSE_ERROR_FALLBACK) {
        setStreamMode("mock-fallback");
        await playFixtureFlow(nextQuestion, routing, delegationId);
      } else {
        await playFixtureFlow(nextQuestion, routing, delegationId);
      }
    }
  };

  const runQuestion = async (rawQuestion) => {
    const nextQuestion = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
    if (!nextQuestion || submitting) return;
    const detectedMentions = parseMentions(nextQuestion);
    const mergedMentions = Array.from(new Set([...mentions, ...detectedMentions]));
    const routing = routeQuestion(nextQuestion);
    setSubmitting(true);
    setHasSubmitted(true);
    setArtifactNotice("");
    setDraft(null);
    setReportRun(null);
    setQuestion("");
    setMentions([]);
    setTraceSteps(initialTraceSteps());
    setErrorState(null);
    setLastQuestion(nextQuestion);
    const delegationId = createUuid();

    if (typeof sendUserMessage === "function") {
      sendUserMessage(nextQuestion);
    }

    const initialMessages = [
      makeMessage({
        author: "user",
        kind: "text",
        body: nextQuestion,
        agents: [],
      }),
      makeMessage({
        id: delegationId,
        author: "agent",
        kind: "delegation",
        agents: routing.targets,
        question: summarizeQuestion(nextQuestion),
        delegation: {
          targets: routing.targets,
          reason: routing.reason,
          summary: summarizeQuestion(nextQuestion),
        },
        status: "waiting",
        viewState: "LOADING",
      }),
    ];
    setMessages(initialMessages);
    try {
      if (preferHttp) {
        await playStreamFlow(nextQuestion, routing, delegationId);
      } else {
        await playFixtureFlow(nextQuestion, routing, delegationId);
      }
    } catch (error) {
      const errorRecord = {
        code: error?.code ?? "INTERNAL_ERROR",
        message: error?.message ?? "분석 중 오류가 발생했습니다.",
        retryable: true,
      };
      const inferredView = resolveErrorViewState("ERROR", errorRecord);
      setErrorState({ viewState: inferredView, error: errorRecord, traceId: createUuid() });
    } finally {
      setSubmitting(false);
    }
  };

  const submitQuestion = async (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    await runQuestion(question);
  };

  const handlePickSuggestion = useCallback((label) => {
    setQuestion(label);
    setHasSubmitted(false);
    setErrorState(null);
  }, []);

  const handleRetry = useCallback(() => {
    if (!lastQuestion) return;
    runQuestion(lastQuestion);
  }, [lastQuestion]);

  return (
    <LazyAgentRuntimeProvider
      initialMessages={runtimeInitialMessages}
      onFrame={handleRuntimeFrame}
      preferHttp={preferHttp}
      baseUrl={sseBaseUrl}
    >
      <AgentRuntimeSuspense>
        <AgentPageChrome
          messages={messages}
          submitting={submitting}
          traceSteps={traceSteps}
          artifactNotice={artifactNotice}
          presentation={presentation}
          viewState={viewState}
          streamMode={streamMode}
          hasSubmitted={hasSubmitted}
          question={question}
          mentions={mentions}
          onChange={setQuestion}
          onMentionsChange={setMentions}
          onSubmit={submitQuestion}
          onPickSuggestion={handlePickSuggestion}
          agentList={AGENT_LIST}
          sideNavItems={SIDE_NAV_ITEMS}
          onNavigate={safeNavigate}
          handleAddToReport={handleAddToReport}
          handleCreateRun={handleCreateRun}
          handleClearDraft={handleClearDraft}
          handleToggleCollapsed={handleToggleCollapsed}
          handleRetry={handleRetry}
          errorState={errorState}
          grid={grid}
          draft={draft}
          collapsed={collapsed}
          reportRun={reportRun}
        />
      </AgentRuntimeSuspense>
    </LazyAgentRuntimeProvider>
  );
}

function AgentPageChrome({
  messages,
  submitting,
  traceSteps,
  artifactNotice,
  presentation,
  viewState,
  streamMode,
  hasSubmitted,
  question,
  mentions,
  onChange,
  onMentionsChange,
  onSubmit,
  onPickSuggestion,
  agentList,
  sideNavItems,
  onNavigate,
  handleAddToReport,
  handleCreateRun,
  handleClearDraft,
  handleToggleCollapsed,
  handleRetry,
  errorState,
  grid,
  draft,
  collapsed,
  reportRun,
}) {
  const isRunning = submitting || viewState === "LOADING" || viewState === "DELAYED";
  return (
    <div className="agent-page" data-stream-mode={streamMode}>
      <aside className="agent-sidebar" aria-label="Answervice 사이드 네비게이션">
        <div className="agent-sidebar__brand">
          <div className="brand-mark">AS</div>
          <div>
            <b>Answervice</b>
            <small>Enterprise Intelligence</small>
          </div>
        </div>
        <nav>
          <small className="nav-group">WORKSPACE</small>
          {sideNavItems.map(({ id, path, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={id === "chat" ? "active" : ""}
              aria-current={id === "chat" ? "page" : undefined}
              onClick={() => onNavigate(path)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <small className="nav-group">AGENTS</small>
          {agentList.map((agent) => (
            <span key={agent.id} className="agent-sidebar__agent" style={{ "--agent-hue": agent.hue }}>
              <span className="agent-sidebar__agent-dot" aria-hidden="true" />
              <span>
                <b>{agent.name}</b>
                <small>{agent.role}</small>
              </span>
            </span>
          ))}
        </nav>
        <div className="agent-sidebar__meta">
          <MetaStrip meta={analysisFixtures.ready.meta} />
        </div>
      </aside>

      <main
        className="agent-chat"
        aria-label="분석 챗 메인 영역"
        aria-busy={isRunning}
      >
        <header className="agent-chat__header">
          <div>
            <small>분석 에이전트</small>
            <h2>질문 한 줄로 데이터 근거와 자동 보고서를 연결합니다.</h2>
          </div>
          <span className={`agent-chat__view agent-chat__view--${viewState.toLowerCase()}`}>
            {presentation.label}
          </span>
        </header>
        {hasSubmitted && messages.length > 0 ? (
          <section className="agent-chat__messages" role="log" aria-live="polite" aria-label="분석 대화 로그">
            {messages.map((message) => {
              if (message.kind === "delegation") {
                const isDelegationRunning = message.status === "running";
                return (
                  <MessageBubble key={message.id} message={message}>
                    <DelegationCard
                      delegation={message.delegation}
                      status={message.status ?? "waiting"}
                    />
                    {isDelegationRunning ? <TypingDots label="에이전트가 응답을 준비하고 있습니다" /> : null}
                  </MessageBubble>
                );
              }
              if (message.kind === "trace") {
                return (
                  <MessageBubble key={message.id} message={message}>
                    <TraceSteps steps={traceSteps} />
                  </MessageBubble>
                );
              }
              if (message.kind === "result") {
                return (
                  <MessageBubble key={message.id} message={message}>
                    <ResultCard run={message.run} />
                    <TrustRow run={message.run} />
                  </MessageBubble>
                );
              }
              if (message.author === "user") {
                return (
                  <MessageBubble key={message.id} message={message}>
                    <p>{message.body}</p>
                  </MessageBubble>
                );
              }
              return (
                <MessageBubble key={message.id} message={message}>
                  <p>{message.body}</p>
                  {Array.isArray(message.actions) && message.actions.length > 0 ? (
                    <div className="message-bubble__actions">
                      {message.actions.map((action) => (
                        <button key={action.id} type="button" className="secondary" onClick={() => action.onSelect?.()}>
                          <Sparkles size={12} /> {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </MessageBubble>
              );
            })}
            {isRunning ? <ResultCardSkeleton /> : null}
            {errorState ? (
              <AgentErrorState
                viewState={errorState.viewState}
                error={errorState.error}
                traceId={errorState.traceId}
                onRetry={handleRetry}
              />
            ) : null}
          </section>
        ) : (
          <AgentEmptyState onPick={onPickSuggestion} />
        )}
        {artifactNotice ? <p className="agent-chat__notice" role="status">{artifactNotice}</p> : null}
        <ChatComposer
          value={question}
          mentions={mentions}
          onChange={onChange}
          onMentionsChange={onMentionsChange}
          onSubmit={onSubmit}
          submitting={submitting}
          hasResult={hasSubmitted}
        />
      </main>

      <ArtifactPanel
        draft={draft}
        grid={grid}
        collapsed={collapsed}
        onToggleCollapsed={handleToggleCollapsed}
        onAddToReport={handleAddToReport}
        onCreateRun={handleCreateRun}
        onClearDraft={handleClearDraft}
        reportRun={reportRun}
        isPersisting={submitting}
      />
    </div>
  );
}
