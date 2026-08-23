// First-run suggestion chips for the empty chat zone. Pure data; the page
// renders them and feeds the picked text into the composer.
//
// Constraints honored here so they stay valid even if a future change tries
// to drift away from the I3 product plan:
//   - Exactly four suggestions (matches the placeholder budget on a 12-col
//     grid at desktop + mobile).
//   - Every label is a non-empty Korean sentence ending in `요` / `줘` so
//     users immediately read them as questions, not commands.
//   - IDs are unique so the page can track the chip click in analytics or
//     keyboard focus tests without false positives.

export const SUGGESTIONS = Object.freeze([
  Object.freeze({
    id: "rooms-revenue-trend",
    label: "지난주 객실 매출 추이를 보여줘",
  }),
  Object.freeze({
    id: "member-tier-distribution",
    label: "이번 달 회원 등급별 분포를 비교해줘",
  }),
  Object.freeze({
    id: "fnb-time-top-menu",
    label: "F&B 시간대별 매출 상위 메뉴는?",
  }),
  Object.freeze({
    id: "banquet-cancel-summary",
    label: "연회 예약 취소 사유 요약해줘",
  }),
]);

export const SUGGESTION_LABELS = Object.freeze(SUGGESTIONS.map((entry) => entry.label));

// Lookup helper used by tests and any future analytics hook. Returns the
// matching entry or null when the label is not a registered suggestion.
export function findSuggestionByLabel(label) {
  if (typeof label !== "string" || !label) return null;
  return SUGGESTIONS.find((entry) => entry.label === label) ?? null;
}
