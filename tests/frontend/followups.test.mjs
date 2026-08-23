import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFollowups } from "../../app/enterprise-react/src/lib/followups.js";

const RUN = {
  metrics: [
    { metric_id: "revenue", label: "인식 객실 매출", value: 1, unit: "KRW" },
    { metric_id: "share", label: "직접 예약 비중", value: 2 },
  ],
  evidence: { sources: [{ urn: "urn:answervice:dataset:pms.public.pms_guests", name: "PMS guest fixture" }] },
};

test("지표 라벨로 전기 비교 후속 질문을 만든다", () => {
  const list = buildFollowups("지난주 객실 매출 추이를 보여줘", RUN);
  assert.ok(list[0].startsWith("인식 객실 매출"));
  assert.ok(list[0].includes("이전과 비교"));
});

test("기간 표현을 질문에서 추출해 재사용한다", () => {
  const list = buildFollowups("이번 달 회원 등급별 분포를 비교해줘", {
    ...RUN,
    metrics: [RUN.metrics[1]],
    evidence: { sources: [] },
  });
  assert.ok(list.some((q) => q.includes("이번 달")));
});

test("원천 이름으로 탐색형 후속 질문을 만든다", () => {
  const list = buildFollowups("질문", RUN);
  assert.ok(list.some((q) => q.startsWith("PMS guest fixture")));
});

test("지표가 두 개 이상이면 관계 요약 제안을 넣는다", () => {
  const list = buildFollowups("질문", RUN);
  assert.ok(list.some((q) => q.includes("관계를 요약")));
});

test("결과가 최대 3개이고 중복이 없다", () => {
  const list = buildFollowups("질문", RUN);
  assert.equal(list.length, Math.min(3, new Set(list).size));
  assert.ok(list.length <= 3);
});

test("빈 결과에도 안전한 기본 제안을 반환한다", () => {
  const list = buildFollowups("질문", { metrics: [], evidence: {} });
  assert.ok(list.length >= 1);
});
