import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveViewState } from "../../app/enterprise-react/src/contracts/analysis.ts";
import {
  DRAFT_GRID_BOUNDS,
  VIEW_STATE_PRESENTATION,
  buildArtifactBlocks,
  buildDraftFromRun,
  buildDraftGrid,
  presentViewState,
} from "../../app/enterprise-react/src/lib/reportBridge.js";
import {
  clearStoredDraft,
  publishArtifactToSession,
  readStoredDraft,
  stageArtifact,
  writeStoredDraft,
} from "../../app/enterprise-react/src/lib/artifactStore.js";

const readyRun = {
  question: "7월 객실 매출",
  summary: "7월 28~30일 객실 매출이 낮아졌습니다.",
  artifact: { artifactId: "00000000-0000-0000-0000-0000000002f9", queryId: "fixture-query-success", contextHash: "ctx" },
  metrics: [
    { metricId: "recognized_room_revenue", label: "인식 객실 매출", value: 128400000, unit: "KRW" },
    { metricId: "occupancy_rate", label: "객실 점유율", value: 72.5, unit: "%" },
  ],
  table: { columns: ["business_date", "recognized_room_revenue"], rows: [{ business_date: "2026-07-30", recognized_room_revenue: 40100000 }] },
  chart: { chartType: "line", xField: "business_date", yFields: ["recognized_room_revenue"] },
  evidence: {
    artifactId: "00000000-0000-0000-0000-0000000002f9",
    queryId: "fixture-query-success",
    asOf: "2026-07-30",
    period: { start: "2026-07-01", endExclusive: "2026-08-01" },
    filters: { hotel: "synthetic" },
    cached: false,
    sampling: { applied: false, returnedRows: 1, totalRows: 1 },
  },
  sources: [{ urn: "urn:answervice:dataset:pms.public.reservations" }, { urn: "urn:answervice:dataset:crm.public.membership_history" }],
  meta: { asOf: "2026-07-30", seed: "20260729", schemaVersion: "1.0.0", timezone: "Asia/Seoul", synthetic: true, contractVersion: "OPENAPI-v1.0.0" },
};

test("buildArtifactBlocks produces summary + KPI + chart + evidence cards from a ready run", () => {
  const blocks = buildArtifactBlocks(readyRun);
  assert.ok(blocks.length >= 3);
  assert.equal(blocks[0].type, "summary");
  assert.equal(blocks[0].columns, 12);
  assert.equal(blocks.find((block) => block.type === "kpi").metrics.length, readyRun.metrics.length);
  assert.equal(blocks.find((block) => block.type === "chart").chart.yFields[0], "recognized_room_revenue");
  assert.ok(blocks.find((block) => block.type === "evidence").content.includes("sources urn:answervice:dataset:pms.public.reservations"));
});

test("buildDraftFromRun lays blocks out within the 12-column bounds via the contract helper", () => {
  const draft = buildDraftFromRun(readyRun, { title: "주간 운영 보고서" });
  assert.equal(draft.title, "주간 운영 보고서");
  assert.equal(draft.status, "approved");
  for (const block of draft.blocks) {
    assert.ok(block.x >= 0 && block.x <= 11, `x out of range: ${block.x}`);
    assert.ok(block.w >= 1 && block.w <= 12, `w out of range: ${block.w}`);
    assert.ok(block.x + block.w <= 12, `block overflows row at x=${block.x} w=${block.w}`);
  }
});

test("buildDraftGrid re-clamps raw caller input so x stays inside 0..11 and w inside 1..12", () => {
  const grid = buildDraftGrid([
    { id: "a", title: "A", artifactId: "art-a", w: 13, h: 4, x: 11 }, // would overflow
    { id: "b", title: "B", artifactId: "art-b", w: 6, h: 3, x: -3 }, // negative
  ]);
  assert.equal(DRAFT_GRID_BOUNDS.W_MAX, 12);
  assert.equal(DRAFT_GRID_BOUNDS.X_MIN, 0);
  assert.equal(grid[0].w, 12);
  assert.ok(grid[0].x + grid[0].w <= 12);
  assert.equal(grid[1].x, 0);
  assert.ok(grid[1].w >= 1 && grid[1].w <= 12);
});

test("VIEW_STATE_PRESENTATION covers every AnalysisViewState used by resolveViewState", () => {
  const states = [
    "LOADING",
    "EMPTY",
    "READY",
    "DELAYED",
    "PARTIAL",
    "ERROR",
    "FORBIDDEN",
    "INSUFFICIENT_EVIDENCE",
    "CANCELLED",
  ];
  for (const state of states) {
    const presentation = presentViewState(state);
    assert.ok(presentation.label, `label missing for ${state}`);
    assert.ok(presentation.tone, `tone missing for ${state}`);
    assert.equal(VIEW_STATE_PRESENTATION[state].label, presentation.label);
  }
  // Unknown values still produce a non-empty label fallback.
  assert.equal(presentViewState("UNKNOWN_STATE").label, "UNKNOWN_STATE");
  assert.equal(presentViewState(null).label, "대기");
});

test("view-state mapping reproduces resolveViewState for the standard fixture outcomes", () => {
  // status + error.code tuples copied from analysisFixtures + g1_clarification.
  const cases = [
    { run: { status: "queued" }, expected: "LOADING" },
    { run: { status: "running", delayed: true }, expected: "DELAYED" },
    { run: { status: "running" }, expected: "LOADING" },
    { run: { status: "blocked", error: { code: "CONTEXT_INCOMPLETE" } }, expected: "EMPTY" },
    { run: { status: "blocked", error: { code: "ACCESS_DENIED" } }, expected: "FORBIDDEN" },
    { run: { status: "failed", error: { code: "RESULT_EVIDENCE_MISSING" } }, expected: "INSUFFICIENT_EVIDENCE" },
    { run: { status: "failed" }, expected: "ERROR" },
    { run: { status: "partial" }, expected: "PARTIAL" },
    { run: { status: "success", rowCount: 0, evidenceReady: true }, expected: "EMPTY" },
    { run: { status: "success", rowCount: 5, evidenceReady: true }, expected: "READY" },
    { run: { status: "cancelled" }, expected: "CANCELLED" },
  ];
  for (const { run, expected } of cases) {
    assert.equal(resolveViewState(run), expected, `expected ${expected} for ${JSON.stringify(run)}`);
    const tone = presentViewState(expected).tone;
    assert.ok(["success", "warning", "danger", "muted", "neutral"].includes(tone));
  }
});

test("artifactStore persists drafts and round-trips through localStorage", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const draft = buildDraftFromRun(readyRun, { title: "주간 운영 보고서" });
  assert.equal(writeStoredDraft(draft, storage), true);
  const reloaded = readStoredDraft(storage);
  assert.ok(reloaded);
  assert.equal(reloaded.title, draft.title);
  assert.equal(reloaded.blocks.length, draft.blocks.length);
  assert.equal(clearStoredDraft(storage), true);
  assert.equal(readStoredDraft(storage), null);
});

test("stageArtifact publishes the existing sessionStorage payload consumed by ReportsPage", () => {
  const sessionValues = new Map();
  const sessionStorage = {
    getItem: (key) => (sessionValues.has(key) ? sessionValues.get(key) : null),
    setItem: (key, value) => sessionValues.set(key, String(value)),
    removeItem: (key) => sessionValues.delete(key),
  };
  const sessionPayload = publishArtifactToSession(readyRun, sessionStorage);
  assert.equal(sessionPayload.artifactId, readyRun.artifact.artifactId);
  assert.equal(sessionPayload.queryId, readyRun.artifact.queryId);
  assert.equal(sessionPayload.question, readyRun.question);
  assert.equal(sessionPayload.sourceUrns.length, readyRun.sources.length);
  assert.ok(sessionValues.get("answervice.report.artifact"));
});

test("stageArtifact combines draft persistence and session publish in one call", () => {
  const memory = new Map();
  const sessionValues = new Map();
  const localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const sessionStorage = {
    getItem: (key) => (sessionValues.has(key) ? sessionValues.get(key) : null),
    setItem: (key, value) => sessionValues.set(key, String(value)),
    removeItem: (key) => sessionValues.delete(key),
  };
  const { draft, sessionPayload } = stageArtifact(readyRun, {
    title: "자동 보고서",
    storage: localStorage,
    sessionStorage,
  });
  assert.ok(draft.blocks.length >= 3);
  assert.equal(sessionPayload.artifactId, readyRun.artifact.artifactId);
});
