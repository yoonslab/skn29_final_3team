// Pure view helpers for the DataHub catalog. No side effects, no React, no I/O.
// These functions are the single source of truth for filtering, grouping, and
// tone mapping so the page component and the standalone tests can share them.

const ENGINE_BUCKETS = Object.freeze([
  "PostgreSQL",
  "MySQL",
  "SQL Server",
  "ClickHouse",
  "Snowflake",
  "BigQuery",
]);

const ENGINE_TONE_MAP = Object.freeze({
  PostgreSQL: "tone-blue",
  "SQL Server": "tone-blue",
  MySQL: "tone-amber",
  ClickHouse: "tone-gold",
  Snowflake: "tone-snow",
  BigQuery: "tone-google",
  default: "tone-muted",
});

function asString(value) {
  return value == null ? "" : String(value);
}

function lower(value) {
  return asString(value).trim().toLowerCase();
}

function engineBucketKey(engine) {
  const normalized = asString(engine).trim();
  if (ENGINE_BUCKETS.includes(normalized)) return normalized;
  return "Other";
}

export function filterSources(sources, options = {}) {
  if (!Array.isArray(sources)) return [];
  const query = lower(options.query ?? "");
  const engine = options.engine ? asString(options.engine).trim() : "";
  return sources.filter((source) => {
    if (!source || typeof source !== "object") return false;
    if (engine) {
      const sourceEngine = asString(source.engine).trim();
      if (engine === "__other__") {
        if (ENGINE_BUCKETS.includes(sourceEngine)) return false;
      } else if (sourceEngine !== engine) {
        return false;
      }
    }
    if (!query) return true;
    const haystack = [
      source.urn,
      source.fqn,
      source.engine,
      source.owner,
      ...(Array.isArray(source.metric_ids) ? source.metric_ids : []),
    ].map(lower);
    return haystack.some((field) => field.includes(query));
  });
}

export function countMetrics(sources) {
  if (!Array.isArray(sources)) return 0;
  let total = 0;
  for (const source of sources) {
    if (!source || !Array.isArray(source.metric_ids)) continue;
    total += source.metric_ids.length;
  }
  return total;
}

export function engineBadgeTone(engine) {
  const normalized = asString(engine).trim();
  if (!normalized) return ENGINE_TONE_MAP.default;
  if (ENGINE_TONE_MAP[normalized]) return ENGINE_TONE_MAP[normalized];
  return ENGINE_TONE_MAP.default;
}

export function groupByEngine(sources) {
  const groups = new Map();
  if (!Array.isArray(sources)) return [];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const key = engineBucketKey(source.engine);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(source);
  }
  // Stable order: known engines first in declared order, then "Other" last.
  const orderedKeys = [...ENGINE_BUCKETS.filter((key) => groups.has(key))];
  if (groups.has("Other")) orderedKeys.push("Other");
  return orderedKeys.map((key) => ({
    engine: key,
    tone: engineBadgeTone(key === "Other" ? "" : key),
    sources: groups.get(key),
  }));
}

export const ENGINE_BUCKET_NAMES = Object.freeze([...ENGINE_BUCKETS, "Other"]);
