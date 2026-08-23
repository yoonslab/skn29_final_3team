import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_TRACE_STEPS,
  TRACE_STATUS,
  buildRunFromResultEvent,
  describeStatus,
  errorFromEvent,
  initialTraceSteps,
  normalizeSseEvent,
  reduceTraceEvent,
  STEP_STATUSES,
} from "../../app/enterprise-react/src/lib/agentTrace.js";
import { parseSseChunk } from "../../app/enterprise-react/src/api/sseClient.js";

test("agentTrace exposes exactly seven steps with the MVP labels", () => {
  assert.equal(AGENT_TRACE_STEPS.length, 7);
  assert.deepEqual(
    AGENT_TRACE_STEPS.map((step) => step.label),
    [
      "질문 이해",
      "컨텍스트 검증",
      "SQL 생성",
      "SQL 안전성 검증",
      "조회 실행",
      "결과 검증",
      "설명 생성",
    ],
  );
  // Numbered short tokens ("1".."7") — no project codenames surface in the UI.
  assert.deepEqual(
    AGENT_TRACE_STEPS.map((step) => step.short),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
  assert.deepEqual(STEP_STATUSES, ["idle", "running", "done", "blocked", "failed"]);
  assert.equal(initialTraceSteps().length, 7);
  assert.equal(initialTraceSteps()[0].status, TRACE_STATUS.IDLE);
  assert.equal(describeStatus("done"), "완료");
  assert.equal(describeStatus("blocked"), "차단");
  assert.equal(describeStatus("failed"), "실패");
});

test("reduceTraceEvent walks the seven steps forward and marks completion", () => {
  let steps = initialTraceSteps();
  steps = reduceTraceEvent(steps, { type: "trace", step: 1, status: "running" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 2, status: "running" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 3, status: "running" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 4, status: "running" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 5, status: "running" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 6, status: "running" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 7, status: "running" });
  // Earlier idle steps should auto-complete when later ones start.
  assert.equal(steps[0].status, TRACE_STATUS.DONE);
  assert.equal(steps[6].status, TRACE_STATUS.RUNNING);
  steps = reduceTraceEvent(steps, { type: "trace", step: 7, status: "done" });
  assert.equal(steps[6].status, TRACE_STATUS.DONE);
  steps = reduceTraceEvent(steps, { type: "done", trace_id: "trace-001", duration_ms: 1234 });
  assert.equal(steps.every((step) => step.status === TRACE_STATUS.DONE), true);
});

test("reduceTraceEvent surfaces failure and marks unfinished steps blocked", () => {
  let steps = initialTraceSteps();
  steps = reduceTraceEvent(steps, { type: "trace", step: 1, status: "done" });
  steps = reduceTraceEvent(steps, { type: "trace", step: 3, status: "running" });
  steps = reduceTraceEvent(steps, {
    type: "error",
    step: 3,
    code: "SQL_POLICY_BLOCKED",
    message: "차단된 SQL",
  });
  assert.equal(steps[0].status, TRACE_STATUS.DONE);
  assert.equal(steps[1].status, TRACE_STATUS.DONE);
  assert.equal(steps[2].status, TRACE_STATUS.FAILED);
  assert.equal(steps[2].meta.code, "SQL_POLICY_BLOCKED");
  // Steps 4..7 were idle when the failure happened → blocked.
  for (let i = 3; i < steps.length; i += 1) {
    assert.equal(steps[i].status, TRACE_STATUS.BLOCKED, `step ${i + 1} should be blocked`);
  }
});

test("reduceTraceEvent normalizes result events into a finished timeline", () => {
  let steps = initialTraceSteps();
  steps = reduceTraceEvent(steps, { type: "trace", step: 5, status: "running" });
  steps = reduceTraceEvent(steps, { type: "result", artifact_id: "art-1" });
  assert.equal(steps.every((step) => step.status === TRACE_STATUS.DONE), true);
});

test("normalizeSseEvent maps wire payloads onto reducer-friendly shapes", () => {
  const trace = normalizeSseEvent({ type: "trace", step: 2, status: "running", meta: { foo: 1 } });
  assert.equal(trace.type, "trace");
  assert.equal(trace.step, 2);
  assert.equal(trace.status, "running");

  const result = normalizeSseEvent({
    type: "result",
    artifact_id: "art-7",
    metrics: [{ metric_id: "revenue", value: 1 }],
    table: { columns: ["x"], rows: [{ x: 1 }] },
    chart: { chart_type: "line", x_field: "x", y_fields: ["y"] },
    evidence: { as_of: "2026-07-30" },
  });
  assert.equal(result.type, "result");
  assert.equal(result.metrics.length, 1);
  assert.equal(result.chart.x_field, "x");

  const error = normalizeSseEvent({ type: "error", code: "ACCESS_DENIED", message: "권한 없음", retryable: false });
  assert.equal(error.code, "ACCESS_DENIED");
  assert.equal(error.retryable, false);

  const done = normalizeSseEvent({ type: "done", trace_id: "trace-2", duration_ms: 42 });
  assert.equal(done.traceId, "trace-2");
  assert.equal(done.durationMs, 42);

  assert.equal(normalizeSseEvent({ type: "unknown" }).type, "unknown");
  assert.equal(normalizeSseEvent(null), null);
  assert.equal(normalizeSseEvent({ type: 123 }), null);
});

test("buildRunFromResultEvent copies metrics/table/chart/evidence into a normalized run", () => {
  const baseRun = {
    artifact: { artifactId: "old", queryId: "q-old", contextHash: "ctx-old" },
    question: "질문",
    summary: "이전 요약",
    metrics: [],
    table: null,
    chart: null,
    evidence: null,
    sources: [{ urn: "urn:a" }],
    meta: { asOf: "2026-07-30" },
  };
  const run = buildRunFromResultEvent({
    type: "result",
    artifact_id: "art-new",
    metrics: [{ metric_id: "recognized_room_revenue", label: "인식 객실 매출", value: 128400000, unit: "KRW" }],
    table: { columns: ["business_date"], rows: [{ business_date: "2026-07-30" }] },
    chart: { chart_type: "line", x_field: "business_date", y_fields: ["recognized_room_revenue"] },
    evidence: {
      artifact_id: "art-new",
      query_id: "query-new",
      as_of: "2026-07-30",
      period: { start: "2026-07-01", end_exclusive: "2026-08-01" },
      sampling: { applied: false, returned_rows: 1, total_rows: 1 },
    },
  }, baseRun);
  assert.equal(run.status, "success");
  assert.equal(run.artifact.artifactId, "art-new");
  assert.equal(run.artifact.queryId, "query-new");
  assert.equal(run.metrics[0].metricId, "recognized_room_revenue");
  assert.equal(run.chart.xField, "business_date");
  assert.equal(run.table.rows.length, 1);
  assert.equal(run.evidence.period.start, "2026-07-01");
  assert.equal(run.evidence.period.endExclusive, "2026-08-01");
  assert.equal(run.sources[0].urn, "urn:a");
});

test("errorFromEvent preserves codes and retryable flags", () => {
  assert.equal(errorFromEvent({ type: "error", code: "ACCESS_DENIED", message: "권한", retryable: false }).code, "ACCESS_DENIED");
  assert.equal(errorFromEvent({ type: "error", code: "ACCESS_DENIED", message: "권한", retryable: true }).retryable, true);
  assert.equal(errorFromEvent({ type: "trace", step: 1 }), null);
  assert.equal(errorFromEvent({ type: "error" }).code, "INTERNAL_ERROR");
});

test("parseSseChunk splits multi-frame buffers and preserves JSON payloads", () => {
  const chunk = [
    "event: trace",
    "data: {\"type\":\"trace\",\"step\":1,\"status\":\"running\"}",
    "",
    "event: result",
    "data: {\"type\":\"result\",\"artifact_id\":\"a1\"}",
    "",
    "",
  ].join("\n");
  const { events, rest } = parseSseChunk(chunk);
  assert.equal(rest, "");
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "trace");
  assert.equal(events[0].data.step, 1);
  assert.equal(events[1].data.artifact_id, "a1");
});

test("parseSseChunk holds incomplete frames until the next chunk arrives", () => {
  const first = "event: trace\ndata: {\"type\":\"trace\",\"step\":1,\"s";
  const { events, rest } = parseSseChunk(first);
  assert.equal(events.length, 0);
  assert.ok(rest.startsWith("event: trace"));

  const second = `${rest}tatus\":\"running\"}\n\n`;
  const secondResult = parseSseChunk(second);
  assert.equal(secondResult.events.length, 1);
  assert.equal(secondResult.events[0].data.status, "running");
});
