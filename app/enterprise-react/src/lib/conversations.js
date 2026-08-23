// 멀티턴 대화 세션 모델 — 저장·조회·메시지 추가의 순수 로직.
// UI 상태 없음, localStorage는 어댑터를 통해 주입(테스트에서 메모리 사용).

export const STORAGE_KEY = "answervice.chat.conversations.v2";

let seq = 0;
export function makeId(prefix = "c") {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export function createConversation(title = "새 채팅", nowIso = new Date().toISOString()) {
  return { id: makeId("conv"), title, createdAt: nowIso, updatedAt: nowIso, messages: [] };
}

export function touch(conversation, nowIso) {
  return { ...conversation, updatedAt: nowIso ?? new Date().toISOString() };
}

export function appendUserMessage(conversation, text, nowIso = new Date().toISOString()) {
  const body = String(text ?? "").trim();
  if (!body) return conversation;
  const message = { id: makeId("m"), role: "user", text: body, at: nowIso };
  return withMessage(conversation, message, nowIso);
}

export function appendAssistantMessage(conversation, partial, nowIso = new Date().toISOString()) {
  const message = {
    id: makeId("a"),
    role: "assistant",
    agents: [],
    body: "",
    steps: null,
    result: null,
    reportOpenable: false,
    streaming: true,
    ...partial,
  };
  return withMessage(conversation, message, nowIso);
}

export function patchAssistantMessage(conversation, messageId, patch, nowIso = new Date().toISOString()) {
  const next = conversation.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
  if (next === conversation.messages) return conversation;
  return touch({ ...conversation, messages: next }, nowIso);
}

function withMessage(conversation, message, nowIso) {
  return touch(
    { ...conversation, messages: [...conversation.messages, message], title: deriveTitle(conversation.title, conversation.messages.length, message) },
    nowIso,
  );
}

function deriveTitle(currentTitle, existingCount, message) {
  if (existingCount > 0 || currentTitle !== "새 채팅") return currentTitle;
  const source = message.role === "user" ? message.text : "";
  return source ? source.slice(0, 24) : currentTitle;
}

export function sortConversations(conversations) {
  return [...conversations].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function loadConversations(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(storage, conversations) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sortConversations(conversations)));
    return true;
  } catch {
    return false;
  }
}

export function removeConversation(conversations, id) {
  return conversations.filter((c) => c.id !== id);
}
