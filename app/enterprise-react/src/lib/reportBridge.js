// Pure mapping from a normalized AnalysisRun (or raw result payload) to the
// report-block vocabulary consumed by contracts/report.ts. Stays side-effect
// free so the page can call it during render and tests can validate bounds.

import { normalizeDraftLayout } from "../contracts/report.ts";

const SAFE_W_MAX = 12;

function clampWidth(input) {
  if (!Number.isFinite(input)) return 6;
  if (input < 1) return 1;
  if (input > SAFE_W_MAX) return SAFE_W_MAX;
  return Math.round(input);
}

function safeId(prefix, seed) {
  const tail = String(seed ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  return `${prefix}-${tail || Math.random().toString(36).slice(2, 8)}`;
}

export function buildArtifactBlocks(run, options = {}) {
  if (!run || typeof run !== "object") return [];
  const artifactId = run.artifact?.artifactId ?? run.artifact_id ?? "artifact";
  const queryId = run.artifact?.queryId ?? run.query_id ?? "—";
  const sourceUrns = Array.isArray(run.sources) ? run.sources.map((source) => source.urn).filter(Boolean) : [];
  const seed = options.seed ?? artifactId;

  const blocks = [];

  // Block 1: summary — full-width hero.
  blocks.push({
    id: safeId("summary", seed),
    title: run.question ? `${run.question} · 분석 결과 요약` : "분석 결과 요약",
    artifactId,
    queryId,
    question: run.question ?? "",
    sourceUrns,
    type: "summary",
    columns: 12,
    content: run.summary ?? run.error?.message ?? "분석 결과가 준비되면 요약이 표시됩니다.",
  });

  // Block 2: KPI strip — half-row block.
  const metricIds = Array.isArray(run.metrics) ? run.metrics.map((metric) => metric.metricId ?? metric.label).filter(Boolean) : [];
  if (metricIds.length) {
    blocks.push({
      id: safeId("kpi", seed),
      title: "검증된 핵심 지표",
      artifactId,
      queryId,
      sourceUrns,
      type: "kpi",
      columns: 6,
      metrics: run.metrics.map((metric) => ({
        metricId: metric.metricId ?? metric.label ?? "metric",
        label: metric.label ?? metric.metricId ?? "지표",
        value: metric.value ?? null,
        unit: metric.unit ?? null,
      })),
      content: metricIds.join(", "),
    });
  }

  // Block 3: chart card — half-row next to KPIs.
  if (run.chart && run.table?.rows?.length) {
    blocks.push({
      id: safeId("chart", seed),
      title: `${run.chart.chartType ?? "chart"} · ${run.chart.xField ?? "x"}`,
      artifactId,
      queryId,
      sourceUrns,
      type: "chart",
      columns: 6,
      chart: {
        chartType: run.chart.chartType ?? "line",
        xField: run.chart.xField ?? null,
        yFields: run.chart.yFields ?? [],
      },
      content: `chart x=${run.chart.xField ?? "?"} y=${(run.chart.yFields ?? []).join(",")}`,
    });
  }

  // Block 4: evidence card — full width source trail.
  if (run.evidence) {
    blocks.push({
      id: safeId("evidence", seed),
      title: "근거 요약",
      artifactId,
      queryId,
      sourceUrns,
      type: "evidence",
      columns: 12,
      content: [
        `as_of ${run.evidence.asOf ?? run.meta?.asOf ?? "—"}`,
        run.evidence.period ? `period ${run.evidence.period.start}~${run.evidence.period.endExclusive}` : null,
        run.evidence.sampling ? `sampling ${run.evidence.sampling.returnedRows}/${run.evidence.sampling.totalRows ?? "?"}` : null,
        sourceUrns.length ? `sources ${sourceUrns.join(", ")}` : null,
      ].filter(Boolean).join(" · "),
    });
  }

  return blocks;
}

// Reuse the contract helper so any future change in column bounds / span
// rules propagates without duplicating the layout algorithm.
export function buildDraftFromRun(run, definition = {}) {
  const blocks = buildArtifactBlocks(run);
  const layout = normalizeDraftLayout(blocks.map((block) => ({
    id: block.id,
    title: block.title,
    artifactId: block.artifactId,
    queryId: block.queryId,
    question: block.question,
    sourceUrns: block.sourceUrns,
    columns: clampWidth(block.columns ?? 6),
    w: clampWidth(block.columns ?? 6),
    h: block.type === "summary" ? 4 : block.type === "evidence" ? 3 : 3,
  })));
  return {
    definitionId: definition.definitionId ?? `report-${run.artifact?.artifactId ?? "auto"}`,
    version: 1,
    status: "approved",
    title: definition.title ?? "분석 자동 보고서 초안",
    blocks: layout,
  };
}

// Map a `view state` (resolveViewState result) to a UI badge label and tone.
// Lives here so the page and the tests share a single source of truth.
export const VIEW_STATE_PRESENTATION = Object.freeze({
  LOADING: { label: "분석 중", tone: "neutral" },
  EMPTY: { label: "결과 없음", tone: "muted" },
  READY: { label: "분석 완료", tone: "success" },
  DELAYED: { label: "응답 지연", tone: "warning" },
  PARTIAL: { label: "부분 완료", tone: "warning" },
  ERROR: { label: "분석 실패", tone: "danger" },
  FORBIDDEN: { label: "접근 불가", tone: "danger" },
  INSUFFICIENT_EVIDENCE: { label: "근거 부족", tone: "warning" },
  CANCELLED: { label: "분석 취소", tone: "muted" },
});

export function presentViewState(viewState) {
  if (typeof viewState !== "string") return { label: "대기", tone: "neutral" };
  return VIEW_STATE_PRESENTATION[viewState] ?? { label: viewState, tone: "neutral" };
}

// Compile an array of normalized blocks into the bounded grid preview shown on
// the right-hand panel. Each row carries the layout coordinates that the
// ReportsPage editor understands. The function asserts 0 ≤ x ≤ 11 and 1 ≤ w ≤ 12.
export function buildDraftGrid(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block, index) => {
    const w = clampWidth(block.w ?? block.columns ?? 6);
    const h = Math.max(1, Math.min(8, Number(block.h ?? 3) || 3));
    // The helper above guarantees 0 ≤ x and x + w ≤ 12, but we re-check here so
    // tests can verify the contract even when callers provide raw input.
    const rawX = Number(block.x ?? 0);
    const x = Math.max(0, Math.min(SAFE_W_MAX - w, rawX));
    return {
      index,
      id: block.id,
      title: block.title,
      artifactId: block.artifactId,
      w,
      h,
      x,
      y: Math.max(0, Number(block.y ?? index) || index),
      tone: block.type ?? "text",
    };
  });
}

export const DRAFT_GRID_BOUNDS = Object.freeze({
  W_MAX: SAFE_W_MAX,
  X_MIN: 0,
});
