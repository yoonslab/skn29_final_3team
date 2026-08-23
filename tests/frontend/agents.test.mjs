import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENTS,
  AGENT_IDS,
  AGENT_LIST,
  parseMentions,
  resolveMentionToken,
  ROUTE_REASON,
  routeQuestion,
  orderAgents,
} from "../../app/enterprise-react/src/lib/agents.js";

test("agents roster exposes four unique agents with non-empty Korean names and roles", () => {
  assert.equal(AGENT_IDS.length, 4);
  const ids = new Set();
  for (const id of AGENT_IDS) {
    assert.ok(!ids.has(id), `duplicate id ${id}`);
    ids.add(id);
    const agent = AGENTS[id];
    assert.ok(agent && typeof agent === "object");
    assert.equal(agent.id, id);
    assert.ok(agent.name && typeof agent.name === "string" && agent.name.trim().length > 0, `name missing for ${id}`);
    assert.ok(agent.role && typeof agent.role === "string" && agent.role.trim().length > 0, `role missing for ${id}`);
    assert.ok(Number.isFinite(agent.hue) && agent.hue >= 0 && agent.hue <= 360, `hue out of range for ${id}`);
  }
  // Roster order: coordinator, analyst, reporter, steward (the canonical roster).
  assert.deepEqual(AGENT_LIST.map((agent) => agent.id), ["coordinator", "analyst", "reporter", "steward"]);
  assert.equal(AGENTS.coordinator.name, "코디네이터");
  assert.equal(AGENTS.analyst.name, "데이터 분석가");
  assert.equal(AGENTS.reporter.name, "리포트 작성가");
  assert.equal(AGENTS.steward.name, "데이터 큐레이터");
});

test("parseMentions resolves Korean names, ids, and ignores unknown tokens", () => {
  assert.deepEqual(parseMentions("@데이터 분석가 매출 알려줘"), ["analyst"]);
  assert.deepEqual(parseMentions("@analyst 매출 알려줘"), ["analyst"]);
  assert.deepEqual(parseMentions("@steward 카탈로그 확인"), ["steward"]);
  assert.deepEqual(parseMentions("@코디네이터 @reporter 같이"), ["coordinator", "reporter"]);
  // Unknown names are dropped instead of becoming a mention.
  assert.deepEqual(parseMentions("@unknown_bot 안녕"), []);
  // Empty / non-string input is safe.
  assert.deepEqual(parseMentions(""), []);
  assert.deepEqual(parseMentions(null), []);
  // Multiple occurrences of the same agent keep a single id.
  assert.deepEqual(parseMentions("@analyst @analyst @데이터 분석가"), ["analyst"]);
  // Order preserved: coordinator first when it appears before the others.
  assert.deepEqual(parseMentions("@reporter @coordinator 정리해줘"), ["reporter", "coordinator"]);
});

test("resolveMentionToken is case-insensitive and tolerates whitespace in names", () => {
  assert.equal(resolveMentionToken("analyst"), "analyst");
  assert.equal(resolveMentionToken("ANALYST"), "analyst");
  assert.equal(resolveMentionToken("@reporter"), "reporter");
  assert.equal(resolveMentionToken("데이터 분석가"), "analyst");
  assert.equal(resolveMentionToken("@데이터  분석가"), "analyst");
  assert.equal(resolveMentionToken(null), null);
  assert.equal(resolveMentionToken(""), null);
  assert.equal(resolveMentionToken("@ghost"), null);
});

test("routeQuestion prefers explicit mentions over keyword fallback", () => {
  const mentioned = routeQuestion("@steward 카탈로그 보여줘");
  assert.deepEqual(mentioned.targets, ["coordinator", "steward"]);
  assert.equal(mentioned.reason, ROUTE_REASON.MENTION);
  assert.deepEqual(mentioned.mentions, ["steward"]);

  // Coordinator-only mention returns just the coordinator.
  const coordOnly = routeQuestion("@코디네이터 도움말");
  assert.deepEqual(coordOnly.targets, ["coordinator"]);
  assert.equal(coordOnly.reason, ROUTE_REASON.MENTION);
});

test("routeQuestion falls back to reporter / steward keyword buckets and the analyst default", () => {
  const reporter = routeQuestion("월간 매출 리포트 정리해줘");
  assert.deepEqual(reporter.targets, ["coordinator", "reporter"]);
  assert.equal(reporter.reason, ROUTE_REASON.KEYWORD_REPORTER);
  assert.equal(reporter.source, "reporter");

  const steward = routeQuestion("PMS 원천 메타데이터 알려줘");
  assert.deepEqual(steward.targets, ["coordinator", "steward"]);
  assert.equal(steward.reason, ROUTE_REASON.KEYWORD_STEWARD);

  const analyst = routeQuestion("지난주 객실 점유율 보여줘");
  assert.deepEqual(analyst.targets, ["coordinator", "analyst"]);
  assert.equal(analyst.reason, ROUTE_REASON.DEFAULT_ANALYST);
  assert.equal(analyst.source, "analyst");
});

test("routeQuestion defaults to the analyst bucket when no keyword matches", () => {
  const generic = routeQuestion("오늘 회의 몇 시였지?");
  assert.deepEqual(generic.targets, ["coordinator", "analyst"]);
  assert.equal(generic.reason, ROUTE_REASON.DEFAULT_ANALYST);
  // Non-string input still resolves to the safe default.
  const empty = routeQuestion("");
  assert.deepEqual(empty.targets, ["coordinator", "analyst"]);
  assert.equal(empty.reason, ROUTE_REASON.DEFAULT_ANALYST);
});

test("orderAgents sorts the coordinator first and dedupes the rest", () => {
  assert.deepEqual(orderAgents(["reporter", "analyst", "coordinator"]), ["coordinator", "analyst", "reporter"]);
  assert.deepEqual(orderAgents(["steward", "steward", "analyst"]), ["analyst", "steward"]);
  assert.deepEqual(orderAgents(["analyst", "reporter", "steward"]), ["analyst", "reporter", "steward"]);
  assert.deepEqual(orderAgents(null), []);
});