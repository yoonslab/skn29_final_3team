// Adapter that bridges the existing SSE agent stream to @assistant-ui/react's
// `useLocalRuntime`. Two pieces:
//   1. `sseEventsToContentParts(events)` — pure function the tests exercise.
//      Given an array of normalized SSE frames (`{ event, data }` shape), it
//      emits the cumulative list of `TextMessagePart`s the assistant bubble
//      should show.
//   2. `createAgentChatAdapter({ onFrame })` — returns a `ChatModelAdapter`
//      whose `run` is an async generator. Each frame is forwarded to
//      `onFrame(frame)` so the page keeps driving the timeline/delegation/
//      result state it owns, and a fresh content snapshot is yielded back
//      to the assistant-ui runtime so the bubble stays consistent.
//
// On any wire failure (non-2xx, refused, abort) the adapter throws the same
// `SSE_ERROR_FALLBACK` sentinel the page already catches — keeping the
// existing `playFixtureFlow` fallback path untouched.

import { createUuid } from "../utils/createUuid.ts";
import { OPENAPI_VERSION } from "../contracts/analysis.ts";
import { SSE_ERROR_FALLBACK, openAgentStream } from "./sseClient.js";
import { AGENT_TRACE_STEPS, describeStatus, TRACE_STATUS } from "../lib/agentTrace.js";

const STATUS_GLYPH = {
  [TRACE_STATUS.IDLE]: "○",
  [TRACE_STATUS.RUNNING]: "▶",
  [TRACE_STATUS.DONE]: "✓",
  [TRACE_STATUS.BLOCKED]: "■",
  [TRACE_STATUS.FAILED]: "✗",
};

const SAFE_ERROR_MESSAGES = {
  ACCESS_DENIED: "권한이 없어 분석을 진행할 수 없습니다.",
  CONTEXT_INCOMPLETE: "필요한 컨텍스트가 부족해 질문을 명확히 해 주세요.",
  SQL_POLICY_BLOCKED: "SQL 정책에 걸려 실행이 차단됐습니다.",
  QUERY_SOURCE_FAILED: "데이터 조회 중 오류가 발생했습니다.",
  RESULT_EVIDENCE_MISSING: "근거가 충분하지 않아 표시할 수 없습니다.",
  PARTIAL_FAILURE: "일부 원천 조회가 실패해 부분 결과만 제공합니다.",
  INSUFFICIENT_EVIDENCE: "근거 부족으로 결과를 표시하지 않습니다.",
  RATE_LIMITED: "잠시 후 다시 시도해 주세요.",
  CONTRACT_VERSION_MISMATCH: "계약 버전이 맞지 않아 결과를 표시할 수 없습니다.",
  SCHEMA_VERSION_MISMATCH: "스키마 버전이 맞지 않아 결과를 표시할 수 없습니다.",
  INTERNAL_ERROR: "분석 중 내부 오류가 발생했습니다.",
};

function safeErrorMessage(payload) {
  const code = payload && typeof payload === "object" ? payload.code : null;
  if (code && SAFE_ERROR_MESSAGES[code]) return SAFE_ERROR_MESSAGES[code];
  if (payload && typeof payload === "object" && typeof payload.message === "string" && payload.message) {
    return payload.message;
  }
  return "분석 중 오류가 발생했습니다.";
}

function traceLabelFor(stepNumber) {
  const step = AGENT_TRACE_STEPS.find((entry) => entry.id === stepNumber);
  if (!step) return `${stepNumber}단계`;
  return `${step.short}. ${step.label}`;
}

function normalizeFrame(frame) {
  if (!frame || typeof frame !== "object") return null;
  const payload = frame.data ?? {};
  const rawType = typeof payload.type === "string"
    ? payload.type
    : (typeof frame.event === "string" && frame.event !== "message" ? frame.event : null);
  if (!rawType) return null;
  const type = rawType.toLowerCase();
  return { type, payload };
}

function renderSummary(payload) {
  const artifactId = payload.artifact_id ?? payload.artifactId ?? "—";
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
  const table = payload.table ?? null;
  const evidence = payload.evidence ?? null;
  const lines = [`🎯 분석 결과 (Artifact ${artifactId})`];
  for (const metric of metrics) {
    const label = metric.label ?? metric.metric_id ?? "지표";
    const value = typeof metric.value === "number" ? metric.value.toLocaleString("ko-KR") : metric.value ?? "—";
    const unit = metric.unit ?? "";
    lines.push(`· ${label} · ${value}${unit ? " " + unit : ""}`);
  }
  if (table && Array.isArray(table.rows)) {
    lines.push(`· 표 행 수 · ${table.rows.length}`);
  }
  if (evidence && Array.isArray(evidence.sources)) {
    const urns = evidence.sources.map((source) => source.urn).filter(Boolean);
    if (urns.length) lines.push(`· 출처 · ${urns.join(", ")}`);
  }
  return lines.join("\n");
}

// Pure: convert the cumulative SSE frames into the text content parts the
// assistant-ui bubble should display. Order of frames is preserved. The
// returned array is a single-element list whose `text` is the full transcript
// so the runtime can keep streaming state in lockstep with the page.
export function sseEventsToContentParts(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const lines = [];
  for (const frame of events) {
    const normalized = normalizeFrame(frame);
    if (!normalized) continue;
    const { type, payload } = normalized;
    if (type === "trace") {
      const step = typeof payload.step === "number" ? payload.step : Number(payload.step) || 0;
      const status = describeStatus(payload.status ?? "running");
      const glyph = STATUS_GLYPH[payload.status] ?? STATUS_GLYPH[TRACE_STATUS.RUNNING];
      lines.push(`${glyph} ${traceLabelFor(step)} — ${status}`);
    } else if (type === "result") {
      lines.push(renderSummary(payload));
    } else if (type === "error") {
      lines.push(`⚠ ${safeErrorMessage(payload)}`);
    } else if (type === "done") {
      const duration = payload.duration_ms ?? payload.durationMs;
      lines.push(`완료 · ${typeof duration === "number" ? `${duration}ms` : "응답 종료"}`);
    }
  }
  if (lines.length === 0) return [];
  return [{ type: "text", text: lines.join("\n") }];
}

// Factory: returns a `ChatModelAdapter` whose `run` is an async generator.
// `onFrame` is called for every parsed SSE frame so the page can drive its
// own timeline/delegation/result state outside the runtime.
export function createAgentChatAdapter(options = {}) {
  const onFrame = typeof options.onFrame === "function" ? options.onFrame : () => {};
  const baseUrl = options.baseUrl
    ?? (typeof import.meta !== "undefined" ? import.meta.env?.VITE_AGENT_STREAM_URL : null)
    ?? "http://127.0.0.1:18000";
  const endpoint = options.endpoint ?? "/api/v1/agent/analyze/stream";
  const openStream = options.openStream ?? openAgentStream;
  const fetchImpl = options.fetchImpl;

  return {
    async *run({ messages, abortSignal }) {
      const lastUser = [...messages].reverse().find((message) => message?.role === "user");
      const text = extractLastUserText(lastUser);
      if (!text) return;
      let stream;
      try {
        stream = openStream({
          baseUrl,
          endpoint,
          body: { question: text, conversation_id: createUuid() },
          fetchImpl,
          signal: abortSignal,
          headers: {
            "X-Contract-Version": OPENAPI_VERSION,
          },
        });
      } catch (error) {
        throw new Error(SSE_ERROR_FALLBACK);
      }

      const cumulative = [];
      try {
        for await (const frame of stream) {
          onFrame(frame);
          cumulative.push(frame);
          const content = sseEventsToContentParts(cumulative);
          if (content.length) {
            yield { content };
          }
        }
      } catch (error) {
        throw new Error(SSE_ERROR_FALLBACK);
      }
    },
  };
}

function extractLastUserText(message) {
  if (!message || typeof message !== "object") return "";
  const parts = Array.isArray(message.content) ? message.content : [];
  const text = parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text;
}