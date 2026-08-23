import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sseEventsToContentParts,
} from "../../app/enterprise-react/src/api/agentRuntimeAdapter.js";

function frame(type, data) {
  return { event: type, data };
}

test("sseEventsToContentParts returns an empty list for an empty / invalid input", () => {
  assert.deepEqual(sseEventsToContentParts([]), []);
  assert.deepEqual(sseEventsToContentParts(null), []);
  assert.deepEqual(sseEventsToContentParts(undefined), []);
  // Frames without a recognizable `type` are ignored, so the output stays empty.
  assert.deepEqual(sseEventsToContentParts([{ event: "message", data: { no_type: true } }]), []);
});

test("sseEventsToContentParts accumulates seven trace lines with the MVP labels", () => {
  const events = [];
  for (let step = 1; step <= 7; step += 1) {
    events.push(frame("trace", { type: "trace", step, status: step === 7 ? "done" : "running" }));
  }
  const parts = sseEventsToContentParts(events);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, "text");
  const lines = parts[0].text.split("\n");
  assert.equal(lines.length, 7);
  // First four canonical labels (the rest must follow the same numbering).
  assert.match(lines[0], /질문 이해/);
  assert.match(lines[1], /컨텍스트 검증/);
  assert.match(lines[2], /SQL 생성/);
  assert.match(lines[3], /SQL 안전성 검증/);
  assert.match(lines[4], /조회 실행/);
  assert.match(lines[5], /결과 검증/);
  assert.match(lines[6], /설명 생성/);
  // Each line carries a status glyph.
  assert.ok(lines.every((line) => /[✓▶○■✗]/.test(line)));
});

test("sseEventsToContentParts emits an artifact summary containing the artifact id and metric lines", () => {
  const events = [
    frame("trace", { type: "trace", step: 7, status: "done" }),
    frame("result", {
      type: "result",
      artifact_id: "00000000-0000-0000-0000-0000000002f9",
      metrics: [
        { metric_id: "recognized_room_revenue", label: "인식 객실 매출", value: 128400000, unit: "KRW" },
        { metric_id: "occupancy_rate", label: "객실 점유율", value: 72.5, unit: "%" },
      ],
      table: { columns: ["business_date"], rows: [{ business_date: "2026-07-30" }] },
      evidence: {
        sources: [{ urn: "urn:answervice:dataset:pms.public.reservations" }],
      },
    }),
  ];
  const parts = sseEventsToContentParts(events);
  const text = parts[0].text;
  assert.match(text, /Artifact 00000000-0000-0000-0000-0000000002f9/);
  assert.match(text, /인식 객실 매출/);
  assert.match(text, /128,400,000 KRW/);
  assert.match(text, /72\.5 %/);
  assert.match(text, /urn:answervice:dataset:pms\.public\.reservations/);
  // Exactly one text part regardless of how many trace/result frames arrived.
  assert.equal(parts.length, 1);
});

test("sseEventsToContentParts maps error events to the safe Korean message and preserves done duration", () => {
  const errorPart = sseEventsToContentParts([
    frame("error", { type: "error", code: "ACCESS_DENIED", message: "raw server text", retryable: false }),
  ]);
  assert.match(errorPart[0].text, /권한/);
  assert.doesNotMatch(errorPart[0].text, /raw server text/);

  const unknown = sseEventsToContentParts([
    frame("error", { type: "error", code: "UNKNOWN_CODE", message: "" }),
  ]);
  assert.match(unknown[0].text, /분석 중 오류가 발생했습니다/);

  const done = sseEventsToContentParts([
    frame("done", { type: "done", duration_ms: 432 }),
  ]);
  assert.match(done[0].text, /완료/);
  assert.match(done[0].text, /432ms/);
});

test("sseEventsToContentParts tolerates frames that omit the explicit `type` field", () => {
  const events = [
    { event: "trace", data: { step: 1, status: "running" } },
    { event: "result", data: { artifact_id: "x", metrics: [] } },
  ];
  const parts = sseEventsToContentParts(events);
  assert.equal(parts.length, 1);
  // Both frames contribute lines.
  assert.match(parts[0].text, /질문 이해/);
  assert.match(parts[0].text, /Artifact x/);
});