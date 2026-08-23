import { useCallback, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";

// Map a normalized view-state + error code to enterprise copy. The page
// always surfaces a trace id so the operator can paste it into a ticket
// without having to dig through the dev tools.
export const ERROR_PRESENTATION = Object.freeze({
  FORBIDDEN: Object.freeze({
    title: "접근할 수 없는 분석 범위입니다.",
    description:
      "이 데이터 원천은 REPORT_ADMIN 권한을 가진 사용자만 조회할 수 있어요. 권한 요청은 관리자에게 문의하세요.",
  }),
  INSUFFICIENT_EVIDENCE: Object.freeze({
    title: "근거가 부족해 결과를 표시하지 않습니다.",
    description:
      "조회 기간, 핵심 지표, 비교 대상 중 일부가 비어 있어요. 예: ‘지난주 객실 매출을 일자별로 보여줘’처럼 기간과 지표를 함께 적어 주세요.",
  }),
  PARTIAL: Object.freeze({
    title: "일부 원천 응답이 늦어 부분 결과만 표시합니다.",
    description:
      "누락된 원천은 일괄 재시도로 다시 받아옵니다. 지금 결과로 인사이트를 먼저 확인해 보세요.",
  }),
  ERROR: Object.freeze({
    title: "분석 중 오류가 발생했습니다.",
    description:
      "잠시 후 다시 시도해 주세요. 같은 오류가 반복되면 trace id를 함께 첨부해 관리자에게 전달해 주세요.",
  }),
  CANCELLED: Object.freeze({
    title: "사용자가 분석을 중단했습니다.",
    description: "다시 질문하면 처음부터 분석을 다시 시작합니다.",
  }),
  EMPTY: Object.freeze({
    title: "조건에 맞는 결과가 없습니다.",
    description:
      "기간이나 객실·회원 등 조건을 조금 넓혀 다시 질문해 보세요. 예: ‘지난달 VIP 객실 매출은 얼마인가요?’.",
  }),
});

function resolvePresentation(viewState, errorCode) {
  if (viewState === "FORBIDDEN") return ERROR_PRESENTATION.FORBIDDEN;
  if (viewState === "INSUFFICIENT_EVIDENCE") return ERROR_PRESENTATION.INSUFFICIENT_EVIDENCE;
  if (viewState === "PARTIAL") return ERROR_PRESENTATION.PARTIAL;
  if (viewState === "CANCELLED") return ERROR_PRESENTATION.CANCELLED;
  if (viewState === "EMPTY") return ERROR_PRESENTATION.EMPTY;
  if (errorCode === "ACCESS_DENIED") return ERROR_PRESENTATION.FORBIDDEN;
  if (errorCode === "RESULT_EVIDENCE_MISSING" || errorCode === "INSUFFICIENT_EVIDENCE") {
    return ERROR_PRESENTATION.INSUFFICIENT_EVIDENCE;
  }
  return ERROR_PRESENTATION.ERROR;
}

export function AgentErrorState({ viewState, error, traceId, onRetry }) {
  const [copied, setCopied] = useState(false);
  const presentation = resolvePresentation(viewState, error?.code);
  const code = error?.code ?? (viewState === "FORBIDDEN" ? "ACCESS_DENIED" : "INTERNAL_ERROR");
  const message = error?.message ?? presentation.description;
  const traceLine = traceId ? `trace_id ${traceId}` : null;

  const handleCopy = useCallback(async () => {
    if (!traceLine) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(traceId);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        setCopied(false);
      }
    }
  }, [traceId, traceLine]);

  const handleRetry = useCallback(() => {
    if (typeof onRetry === "function") onRetry();
  }, [onRetry]);

  return (
    <section
      className="agent-error"
      role="alert"
      aria-live="assertive"
      aria-labelledby="agent-error-title"
    >
      <header>
        <small>분석 실패</small>
        <h3 id="agent-error-title">{presentation.title}</h3>
      </header>
      <p>{message}</p>
      <p className="agent-error__hint">{presentation.description}</p>
      <dl className="agent-error__meta">
        <div><dt>코드</dt><dd>{code}</dd></div>
        {traceId ? (
          <div>
            <dt>trace id</dt>
            <dd className="agent-error__trace">
              <code>{traceLine}</code>
              <button
                type="button"
                className="agent-error__copy"
                onClick={handleCopy}
                aria-label="trace id 복사"
              >
                <Copy size={12} aria-hidden="true" /> {copied ? "복사됨" : "복사"}
              </button>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="agent-error__actions">
        <button type="button" className="primary" onClick={handleRetry} disabled={typeof onRetry !== "function"}>
          <RotateCcw size={12} aria-hidden="true" /> 재시도
        </button>
      </div>
    </section>
  );
}
