import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUGGESTIONS,
  SUGGESTION_LABELS,
  findSuggestionByLabel,
} from "../../app/enterprise-react/src/lib/suggestions.js";
import {
  TRUST_ROW,
  buildTrustRow,
} from "../../app/enterprise-react/src/lib/trustRow.js";

const readyRun = {
  status: "success",
  traceId: "trace-test-001",
  sources: [
    { urn: "urn:answervice:dataset:pms.public.reservations" },
    { urn: "urn:answervice:dataset:crm.public.membership_history" },
    { urn: "urn:answervice:dataset:banquet.public.banquet_bookings" },
  ],
  evidence: { asOf: "2026-07-30" },
  meta: { asOf: "2026-07-30", synthetic: true },
};

const longUrnRun = {
  status: "success",
  evidence: { asOf: "2026-08-15" },
  meta: { asOf: "2026-08-15" },
  sources: [
    {
      urn: "urn:answervice:dataset:very-long-namespace.pms.public.reservations.2026_q3",
    },
  ],
};

test("SUGGESTIONS exports exactly four non-empty, unique suggestion chips", () => {
  assert.equal(SUGGESTIONS.length, 4, "expected exactly four suggestions");
  // Each label is non-empty after trim.
  for (const entry of SUGGESTIONS) {
    assert.ok(entry && typeof entry === "object", "entry should be an object");
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.label, "string");
    assert.ok(entry.label.trim().length > 0, `label missing for ${entry.id}`);
    assert.ok(entry.id.trim().length > 0, `id missing`);
  }
  // IDs are unique.
  const ids = new Set();
  for (const entry of SUGGESTIONS) {
    assert.ok(!ids.has(entry.id), `duplicate suggestion id ${entry.id}`);
    ids.add(entry.id);
  }
  // Labels are unique.
  const labels = new Set();
  for (const entry of SUGGESTIONS) {
    assert.ok(!labels.has(entry.label), `duplicate suggestion label ${entry.label}`);
    labels.add(entry.label);
  }
  // SUGGESTION_LABELS is the public label list, in the same order as the chips render.
  assert.deepEqual(SUGGESTION_LABELS, SUGGESTIONS.map((entry) => entry.label));
});

test("SUGGESTIONS preserves the four canonical questions from the I3 plan", () => {
  assert.deepEqual(SUGGESTION_LABELS, [
    "지난주 객실 매출 추이를 보여줘",
    "이번 달 회원 등급별 분포를 비교해줘",
    "F&B 시간대별 매출 상위 메뉴는?",
    "연회 예약 취소 사유 요약해줘",
  ]);
});

test("findSuggestionByLabel returns the matching entry or null", () => {
  assert.equal(findSuggestionByLabel("이번 달 회원 등급별 분포를 비교해줘").id, "member-tier-distribution");
  assert.equal(findSuggestionByLabel("없는 질문"), null);
  assert.equal(findSuggestionByLabel(null), null);
  assert.equal(findSuggestionByLabel(""), null);
});

test("buildTrustRow formats asOfLabel from run.evidence.asOf with the 데이터 기준시각 prefix", () => {
  const trust = buildTrustRow(readyRun);
  assert.equal(trust.asOfLabel, "데이터 기준시각 2026-07-30");
  // Falls back to run.meta.asOf when evidence.asOf is missing.
  const metaOnly = buildTrustRow({ meta: { asOf: "2026-08-01" } });
  assert.equal(metaOnly.asOfLabel, "데이터 기준시각 2026-08-01");
  // Both fields missing → placeholder dash.
  const none = buildTrustRow({});
  assert.equal(none.asOfLabel, "데이터 기준시각 —");
});

test("buildTrustRow marks synthetic always true and exposes a SYNTHETIC pill constant", () => {
  const trust = buildTrustRow(readyRun);
  assert.equal(trust.synthetic, true);
  assert.equal(TRUST_ROW.SYNTHETIC_LABEL, "SYNTHETIC");
  // Even a run with no meta at all reports synthetic=true so the UI never
  // accidentally drops the pill on a malformed run.
  const empty = buildTrustRow({});
  assert.equal(empty.synthetic, true);
});

test("buildTrustRow produces one source chip per evidence URN with full URN in title", () => {
  const trust = buildTrustRow(readyRun);
  assert.equal(trust.sources.length, 3);
  for (const chip of trust.sources) {
    assert.equal(typeof chip.label, "string");
    assert.equal(typeof chip.title, "string");
    assert.ok(chip.title.length > 0, "title (full URN) must be preserved");
  }
  // Empty / missing sources returns an empty chip list — UI hides the section.
  const noSources = buildTrustRow({});
  assert.deepEqual(noSources.sources, []);
});

test("buildTrustRow middle-truncates long URNs while keeping the full URN in title", () => {
  const trust = buildTrustRow(longUrnRun);
  assert.equal(trust.sources.length, 1);
  const chip = trust.sources[0];
  // The visible label is shorter than the full URN (truncation marker present).
  assert.ok(chip.label.length < chip.title.length, "label should be truncated");
  assert.match(chip.label, /…/, "label should carry the middle ellipsis");
  // The title still carries the full URN so a tooltip/hover reveals it.
  assert.match(chip.title, /^urn:answervice:dataset:/);
});

test("buildTrustRow is deterministic across repeated calls with identical input", () => {
  const a = buildTrustRow(readyRun);
  const b = buildTrustRow(readyRun);
  assert.deepEqual(a, b);
});
