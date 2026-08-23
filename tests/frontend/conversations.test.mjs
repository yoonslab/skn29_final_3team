import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
  loadConversations,
  patchAssistantMessage,
  removeConversation,
  saveConversations,
  sortConversations,
} from "../../app/enterprise-react/src/lib/conversations.js";

const NOW = "2026-08-24T09:00:00.000Z";
const LATER = "2026-08-24T10:30:00.000Z";

test("createConversation은 빈 스레드를 만든다", () => {
  const c = createConversation("새 채팅", NOW);
  assert.equal(c.messages.length, 0);
  assert.equal(c.updatedAt, NOW);
});

test("appendUserMessage는 공백 입력을 무시하고 첫 질문으로 제목을 정한다", () => {
  let c = createConversation("새 채팅", NOW);
  assert.equal(appendUserMessage(c, "   ", LATER), c);
  c = appendUserMessage(c, "지난주 객실 매출 추이를 보여줘", LATER);
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].role, "user");
  assert.equal(c.title, "지난주 객실 매출 추이를 보여줘".slice(0, 24));
  assert.equal(c.updatedAt, LATER);
});

test("assistant 메시지는 기본 필드가 채워진다", () => {
  let c = appendUserMessage(createConversation("t", NOW), "질문", LATER);
  c = appendAssistantMessage(c, { agents: ["analyst"] }, LATER);
  const m = c.messages.at(-1);
  assert.equal(m.streaming, true);
  assert.equal(m.body, "");
});

test("patchAssistantMessage로 스트리밍 결과를 반영한다", () => {
  let c = appendAssistantMessage(createConversation("t", NOW), {}, LATER);
  const id = c.messages.at(-1).id;
  c = patchAssistantMessage(c, id, { body: "분석 완료", streaming: false }, LATER);
  assert.equal(c.messages.at(-1).body, "분석 완료");
  assert.equal(c.messages.at(-1).streaming, false);
});

test("저장·복원 라운드트립이 동일하다", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let list = [appendUserMessage(createConversation("t", NOW), "hello", LATER)];
  assert.equal(saveConversations(storage, list), true);
  assert.deepEqual(loadConversations(storage), sortConversations(list));
});

test("손상된 저장값은 빈 배열로 복구한다", () => {
  const storage = { getItem: () => "{broken", setItem: () => {} };
  assert.deepEqual(loadConversations(storage), []);
});

test("sortConversations는 최근 수정 순으로 정렬한다", () => {
  const a = { ...createConversation("a", NOW), updatedAt: NOW };
  const b = { ...createConversation("b", NOW), updatedAt: LATER };
  assert.equal(sortConversations([a, b])[0].id, b.id);
});

test("removeConversation은 해당 세션만 제거한다", () => {
  const a = createConversation("a", NOW);
  const b = createConversation("b", NOW);
  assert.equal(removeConversation([a, b], a.id).length, 1);
});
