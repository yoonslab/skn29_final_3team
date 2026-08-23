import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, LoaderCircle } from "lucide-react";
import { describeStatus, TRACE_STATUS } from "../../lib/agentTrace.js";

const ICONS = {
  [TRACE_STATUS.IDLE]: CircleDashed,
  [TRACE_STATUS.RUNNING]: LoaderCircle,
  [TRACE_STATUS.DONE]: CheckCircle2,
  [TRACE_STATUS.BLOCKED]: CircleSlash,
  [TRACE_STATUS.FAILED]: AlertTriangle,
};

export function TraceSteps({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <ol className="trace-timeline" aria-label="분석 단계 타임라인">
      {steps.map((step, index) => {
        const Icon = ICONS[step.status] ?? CircleDashed;
        return (
          <li key={step.id} className={`trace-step trace-step--${step.status}`} aria-current={step.status === TRACE_STATUS.RUNNING ? "step" : undefined}>
            <span className="trace-step__index" aria-hidden="true">{index + 1}</span>
            <Icon size={16} aria-hidden="true" />
            <div className="trace-step__body">
              <div className="trace-step__row">
                <b>{step.label}</b>
                <em>{describeStatus(step.status)}</em>
              </div>
              <small>{step.node}</small>
              {step.meta?.code && step.status === TRACE_STATUS.FAILED ? (
                <span className="trace-step__meta" role="status">{step.meta.code}{step.meta.message ? ` · ${step.meta.message}` : ""}</span>
              ) : null}
              {typeof step.meta?.duration_ms === "number" && step.status === TRACE_STATUS.DONE ? (
                <span className="trace-step__meta">{step.meta.duration_ms}ms</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
