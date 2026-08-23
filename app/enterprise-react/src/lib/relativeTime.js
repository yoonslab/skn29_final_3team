// Pure relative-time formatter for Korean UI labels. No Date.now(), no I/O.
// Callers pass both timestamps explicitly so tests can pin the clock.

const KOREAN_LABELS = Object.freeze({
  justNow: "방금 전",
  minutes: (n) => `${n}분 전`,
  hours: (n) => `${n}시간 전`,
  days: (n) => `${n}일 전`,
  dateFallback: (iso) => iso,
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function toMillis(value, label) {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isFinite(ms)) return ms;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  } else if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  throw new TypeError(`relativeTime: ${label} must be a Date, ISO string, or millisecond number`);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateOnlyIso(millis) {
  const date = new Date(millis);
  // Use UTC fields so output is timezone-stable across machines.
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Format the gap between `pastIso` and `nowIso` as a short Korean phrase.
 *
 * Rules:
 *   - pastIso in the future (or equal)  → "방금 전"
 *   - < 1 minute                         → "방금 전"
 *   - < 1 hour                           → "N분 전"
 *   - < 1 day (24h)                      → "N시간 전"
 *   - < 7 days                           → "N일 전"
 *   - otherwise                          → "YYYY-MM-DD" (UTC)
 *
 * Both arguments accept a Date, an ISO 8601 string, or a millisecond number.
 * No environment clock is consulted; this function is fully deterministic.
 *
 * @param {string|number|Date} nowIso
 * @param {string|number|Date} pastIso
 * @returns {string}
 */
export function formatRelativeTime(nowIso, pastIso) {
  const nowMs = toMillis(nowIso, "nowIso");
  const pastMs = toMillis(pastIso, "pastIso");
  const delta = nowMs - pastMs;

  // Future timestamps clamp to "방금 전" so partial-clock skew never
  // surfaces negative deltas to users.
  if (delta < MINUTE_MS) return KOREAN_LABELS.justNow;

  if (delta < HOUR_MS) {
    const minutes = Math.floor(delta / MINUTE_MS);
    return KOREAN_LABELS.minutes(minutes);
  }

  if (delta < DAY_MS) {
    const hours = Math.floor(delta / HOUR_MS);
    return KOREAN_LABELS.hours(hours);
  }

  if (delta < 7 * DAY_MS) {
    const days = Math.floor(delta / DAY_MS);
    return KOREAN_LABELS.days(days);
  }

  return KOREAN_LABELS.dateFallback(toDateOnlyIso(pastMs));
}

export const RELATIVE_TIME_LABELS = Object.freeze({
  JUST_NOW: KOREAN_LABELS.justNow,
});
