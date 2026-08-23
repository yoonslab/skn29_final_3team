// Pure logic for translating SSE agent events into a 7-step trace timeline.
// Extracted so it can run in tests, in a worker, and inside the React page
// without depending on DOM or fetch globals.

export const AGENT_TRACE_STEPS = Object.freeze([
  { id: 1, label: "질문 이해", short: "1", node: "질문 의도와 범위 파악" },
  { id: 2, label: "컨텍스트 검증", short: "2", node: "필수 컨텍스트와 메타데이터 확인" },
  { id: 3, label: "SQL 생성", short: "3", node: "조회 의도를 SQL로 작성" },
  { id: 4, label: "SQL 안전성 검증", short: "4", node: "SQL 정책과 차단 규칙 적용" },
  { id: 5, label: "조회 실행", short: "5", node: "승인된 데이터 원천에서 조회" },
  { id: 6, label: "결과 검증", short: "6", node: "근거와 지표의 무결성 확인" },
  { id: 7, label: "설명 생성", short: "7", node: "결과를 자연어로 정리" },
]);

export const TRACE_STATUS = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  DONE: "done",
  BLOCKED: "blocked",
  FAILED: "failed",
});

export const STEP_STATUSES = Object.freeze([
  TRACE_STATUS.IDLE,
  TRACE_STATUS.RUNNING,
  TRACE_STATUS.DONE,
  TRACE_STATUS.BLOCKED,
  TRACE_STATUS.FAILED,
]);

export function initialTraceSteps() {
  return AGENT_TRACE_STEPS.map((step) => ({
    ...step,
    status: TRACE_STATUS.IDLE,
    meta: null,
  }));
}

function clampStepIndex(step) {
  if (typeof step !== "number" || Number.isNaN(step)) return null;
  if (step < 1) return 0;
  if (step > AGENT_TRACE_STEPS.length) return AGENT_TRACE_STEPS.length - 1;
  return step - 1;
}

function normalizeStatus(input) {
  if (!input) return TRACE_STATUS.RUNNING;
  const value = String(input).toLowerCase();
  if (value === "blocked" || value === "fail" || value === "failed" || value === "error") {
    return value === "blocked" ? TRACE_STATUS.BLOCKED : TRACE_STATUS.FAILED;
  }
  if (value === "done" || value === "success" || value === "succeeded" || value === "ready") return TRACE_STATUS.DONE;
  if (value === "idle" || value === "pending" || value === "queued") return TRACE_STATUS.IDLE;
  return TRACE_STATUS.RUNNING;
}

// Reduce a single SSE event into the next trace timeline state. Pure function:
// returns a new array; never mutates `prev` so React state updates stay safe.
export function reduceTraceEvent(prev, event) {
  if (!event || typeof event !== "object") return prev;
  const steps = Array.isArray(prev) && prev.length === AGENT_TRACE_STEPS.length
    ? prev.map((step) => ({ ...step, meta: step.meta ? { ...step.meta } : null }))
    : initialTraceSteps();

  if (event.type === "reset") return initialTraceSteps();

  if (event.type === "trace") {
    const idx = clampStepIndex(event.step);
    if (idx === null) return steps;
    const current = steps[idx];
    const nextStatus = normalizeStatus(event.status);
    const next = {
      ...current,
      status: nextStatus,
      meta: event.meta && typeof event.meta === "object" ? { ...event.meta } : current.meta,
    };
    // Auto-complete earlier steps when a later step starts so the timeline
    // reflects the latest known state, not stale running markers.
    for (let i = 0; i < idx; i += 1) {
      if (steps[i].status === TRACE_STATUS.IDLE || steps[i].status === TRACE_STATUS.RUNNING) {
        steps[i] = { ...steps[i], status: TRACE_STATUS.DONE };
      }
    }
    // If a downstream step is already done/failed/blocked, don't roll it back.
    if (steps[idx].status === TRACE_STATUS.DONE
      || steps[idx].status === TRACE_STATUS.FAILED
      || steps[idx].status === TRACE_STATUS.BLOCKED) {
      return steps;
    }
    steps[idx] = next;
    return steps;
  }

  if (event.type === "result") {
    return steps.map((step) => ({ ...step, status: TRACE_STATUS.DONE }));
  }

  if (event.type === "error") {
    const failedStep = clampStepIndex(event.step);
    return steps.map((step, index) => {
      if (step.status === TRACE_STATUS.DONE) return step;
      if (failedStep !== null && index < failedStep) return { ...step, status: TRACE_STATUS.DONE };
      if (failedStep !== null && index === failedStep) return { ...step, status: TRACE_STATUS.FAILED, meta: { code: event.code, message: event.message } };
      return { ...step, status: step.status === TRACE_STATUS.IDLE ? TRACE_STATUS.BLOCKED : step.status };
    });
  }

  if (event.type === "done") {
    return steps.map((step) => step.status === TRACE_STATUS.DONE || step.status === TRACE_STATUS.RUNNING
      ? { ...step, status: TRACE_STATUS.DONE, meta: { ...(step.meta || {}), duration_ms: event.duration_ms } }
      : step);
  }

  return steps;
}

// Convert an arbitrary SSE event payload (already parsed from JSON) into the
// normalized shape consumed by `reduceTraceEvent`. Defensive against bad data.
export function normalizeSseEvent(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.type !== "string") return null;
  const type = payload.type.toLowerCase();
  if (type === "trace") {
    return {
      type,
      step: payload.step ?? payload.id ?? payload.index ?? null,
      status: payload.status ?? payload.state ?? "running",
      meta: payload.meta ?? null,
      label: payload.label ?? null,
    };
  }
  if (type === "result") {
    return {
      type,
      artifactId: payload.artifact_id ?? payload.artifactId ?? null,
      metrics: Array.isArray(payload.metrics) ? payload.metrics : [],
      table: payload.table ?? null,
      chart: payload.chart ?? null,
      evidence: payload.evidence ?? null,
    };
  }
  if (type === "error") {
    return {
      type,
      code: payload.code ?? "INTERNAL_ERROR",
      message: payload.message ?? "분석 중 오류가 발생했습니다.",
      retryable: Boolean(payload.retryable),
      step: payload.step ?? null,
    };
  }
  if (type === "done") {
    return {
      type,
      traceId: payload.trace_id ?? payload.traceId ?? null,
      durationMs: payload.duration_ms ?? payload.durationMs ?? null,
    };
  }
  return { type, raw: payload };
}

// Map an SSE `result` payload onto the existing fixture-shaped run object so the
// page can keep using `AnalysisStatePanel` without branching on the source.
export function buildRunFromResultEvent(payload, baseRun) {
  const run = baseRun && typeof baseRun === "object" ? { ...baseRun } : {};
  run.status = "success";
  run.summary = payload.summary ?? run.summary;
  run.metrics = Array.isArray(payload.metrics) && payload.metrics.length
    ? payload.metrics.map((metric) => ({
        metricId: metric.metric_id ?? metric.metricId ?? metric.id ?? "metric",
        label: metric.label ?? metric.metric_id ?? "지표",
        value: metric.value ?? null,
        unit: metric.unit ?? null,
      }))
    : run.metrics ?? [];
  run.table = payload.table ?? run.table ?? null;
  run.chart = payload.chart ? {
    chartType: payload.chart.chart_type ?? payload.chart.chartType ?? "line",
    xField: payload.chart.x_field ?? payload.chart.xField ?? null,
    yFields: payload.chart.y_fields ?? payload.chart.yFields ?? [],
  } : run.chart ?? null;
  run.evidence = payload.evidence ? {
    artifactId: payload.evidence.artifact_id ?? payload.evidence.artifactId ?? run.artifact?.artifactId ?? null,
    queryId: payload.evidence.query_id ?? payload.evidence.queryId ?? run.artifact?.queryId ?? null,
    asOf: payload.evidence.as_of ?? payload.evidence.asOf ?? run.meta?.asOf ?? "2026-07-30",
    period: payload.evidence.period ? {
      start: payload.evidence.period.start,
      endExclusive: payload.evidence.period.end_exclusive ?? payload.evidence.period.endExclusive,
    } : run.evidence?.period,
    filters: payload.evidence.filters ?? run.evidence?.filters ?? {},
    cached: payload.evidence.cached ?? run.evidence?.cached ?? false,
    sampling: payload.evidence.sampling ?? run.evidence?.sampling ?? { applied: false, returnedRows: 0, totalRows: null },
  } : run.evidence;
  run.artifact = payload.artifact_id || payload.artifactId ? {
    artifactId: payload.artifact_id ?? payload.artifactId,
    queryId: payload.query_id ?? payload.queryId ?? run.evidence?.queryId ?? run.artifact?.queryId ?? "—",
    contextHash: payload.context_hash ?? payload.contextHash ?? run.artifact?.contextHash ?? "—",
  } : run.artifact;
  return run;
}

// Map SSE `error` payload to a normalized error record that callers can plug
// into `AnalysisRun.error` and `resolveViewState`. Returns null for non-error.
export function errorFromEvent(payload) {
  if (!payload || payload.type !== "error") return null;
  const code = String(payload.code || "INTERNAL_ERROR");
  const retryable = payload.retryable === undefined ? false : Boolean(payload.retryable);
  return {
    code,
    message: String(payload.message || "분석 중 오류가 발생했습니다."),
    retryable,
  };
}

// Human-readable label for the timeline UI. Korean labels match the product plan.
export function describeStatus(status) {
  switch (status) {
    case TRACE_STATUS.RUNNING: return "실행 중";
    case TRACE_STATUS.DONE: return "완료";
    case TRACE_STATUS.BLOCKED: return "차단";
    case TRACE_STATUS.FAILED: return "실패";
    default: return "대기";
  }
}
