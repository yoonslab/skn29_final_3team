// Pure helper that builds the trust-row metadata shown under every result
// card. The row tells reviewers three things at a glance:
//   1. 데이터 기준시각 — when the underlying snapshot was taken.
//   2. SYNTHETIC pill — explicit marker that the data is fixture data, never
//      a real customer dataset.
//   3. Source chips — the evidence URNs that contributed, middle-truncated
//      so long URNs do not blow up the layout.
//
// Centralized here so the page, the trust-row tests, and any future
// PDF/report exporter share one deterministic shape.

const SYNTHETIC_PILL_LABEL = "SYNTHETIC";
const AS_OF_PREFIX = "데이터 기준시각";
const MAX_VISIBLE_CHARS = 28; // chars of the URN shown before truncation
const TRUNCATION_MARKER = "…";

function asOfLabelFromRun(run) {
  if (!run || typeof run !== "object") return `${AS_OF_PREFIX} —`;
  const fromEvidence = typeof run.evidence?.asOf === "string" ? run.evidence.asOf : null;
  const fromMeta = typeof run.meta?.asOf === "string" ? run.meta.asOf : null;
  const value = fromEvidence ?? fromMeta ?? null;
  return `${AS_OF_PREFIX} ${value ?? "—"}`;
}

function middleTruncate(value, max) {
  if (typeof value !== "string") return "";
  if (value.length <= max) return value;
  if (max <= TRUNCATION_MARKER.length + 1) return value.slice(0, max);
  const visible = max - TRUNCATION_MARKER.length;
  const head = Math.ceil(visible / 2);
  const tail = Math.floor(visible / 2);
  return `${value.slice(0, head)}${TRUNCATION_MARKER}${value.slice(value.length - tail)}`;
}

function buildSourceChips(run) {
  const sources = Array.isArray(run?.sources) ? run.sources : [];
  return sources
    .map((source) => {
      if (!source || typeof source !== "object") return null;
      const urn = typeof source.urn === "string" ? source.urn : null;
      if (!urn) return null;
      const label = middleTruncate(urn, MAX_VISIBLE_CHARS);
      return { label, title: urn };
    })
    .filter(Boolean);
}

// buildTrustRow(run) -> { asOfLabel, synthetic: true, sources: [{ label, title }] }
export function buildTrustRow(run) {
  return {
    asOfLabel: asOfLabelFromRun(run),
    synthetic: true,
    sources: buildSourceChips(run),
  };
}

export const TRUST_ROW = Object.freeze({
  SYNTHETIC_LABEL: SYNTHETIC_PILL_LABEL,
  AS_OF_PREFIX,
  MAX_VISIBLE_CHARS,
});
