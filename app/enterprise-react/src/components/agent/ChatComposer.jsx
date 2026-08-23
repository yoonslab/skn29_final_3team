import { useEffect, useRef, useState } from "react";
import { AgentPicker } from "./AgentPicker.jsx";
import { AGENT_LIST } from "../../lib/agents.js";
import { Send } from "lucide-react";

const MAX_LENGTH = 1000;
const COMPOSER_PLACEHOLDER = "질문을 입력하세요 — 예: 이번 달 VIP 고객 구매액은 얼마인가요?";

function findOpenMentionStart(value, caret) {
  // Walk back from caret to the most recent `@` that isn't preceded by a name
  // character. Returns the index right after the `@`, or -1 if none open.
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === "@") {
      const prev = index > 0 ? value[index - 1] : " ";
      if (/\s/.test(prev) || index === 0) return index + 1;
      return -1;
    }
    if (/\s/.test(char)) return -1;
  }
  return -1;
}

function isMac() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  const userAgent = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac/i.test(userAgent);
}

export function ChatComposer({
  value,
  mentions,
  onChange,
  onMentionsChange,
  onSubmit,
  submitting,
  hasResult,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [caret, setCaret] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    if (activeIndex >= AGENT_LIST.length) setActiveIndex(0);
  }, [pickerOpen, activeIndex]);

  const handleChange = (event) => {
    const next = event.target.value;
    if (next.length > MAX_LENGTH) return;
    onChange(next);
    const cursor = event.target.selectionStart ?? next.length;
    setCaret(cursor);
    const mentionStart = findOpenMentionStart(next, cursor);
    setPickerOpen(mentionStart !== -1);
  };

  const handleSelect = () => {
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const mentionStart = findOpenMentionStart(value, cursor);
    if (mentionStart === -1) return;
    const agent = AGENT_LIST[activeIndex];
    if (!agent) return;
    const before = value.slice(0, mentionStart);
    const afterCursor = value.slice(cursor);
    const token = `@${agent.name} `;
    const nextValue = `${before}${token}${afterCursor}`;
    onChange(nextValue);
    onMentionsChange(Array.from(new Set([...mentions, agent.id])));
    setPickerOpen(false);
    requestAnimationFrame(() => {
      const newCaret = (before + token).length;
      inputRef.current?.setSelectionRange?.(newCaret, newCaret);
      inputRef.current?.focus?.();
      setCaret(newCaret);
    });
  };

  const handleRemoveChip = (id) => {
    onMentionsChange(mentions.filter((entry) => entry !== id));
  };

  const handleSubmit = () => {
    if (submitting) return;
    if (!value.trim()) return;
    onSubmit();
    setPickerOpen(false);
  };

  const handleKeyDown = (event) => {
    if (pickerOpen) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    handleSubmit();
  };

  const shortcutHint = isMac() ? "⌘↩ 전송" : "Ctrl+Enter 전송";

  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {mentions.length > 0 ? (
        <ul className="chat-composer__chips" aria-label="선택된 에이전트">
          {mentions.map((id) => {
            const agent = AGENT_LIST.find((entry) => entry.id === id);
            if (!agent) return null;
            return (
              <li key={id} style={{ "--agent-hue": agent.hue }}>
                <span className="chat-composer__chip-dot" aria-hidden="true" />
                <b>{agent.name}</b>
                <button type="button" aria-label={`${agent.name} 제거`} onClick={() => handleRemoveChip(id)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="chat-composer__row">
        <input
          ref={inputRef}
          aria-label="분석 질문"
          placeholder={COMPOSER_PLACEHOLDER}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(event) => setCaret(event.target.selectionStart ?? value.length)}
          onSelect={(event) => setCaret(event.target.selectionStart ?? value.length)}
          disabled={submitting}
          maxLength={MAX_LENGTH}
        />
        <button type="submit" aria-label="질문 전송" disabled={submitting || !value.trim()}>
          <Send size={16} />
        </button>
      </div>
      {pickerOpen ? (
        <AgentPicker
          open={pickerOpen}
          onPick={(agent) => {
            const idx = AGENT_LIST.findIndex((entry) => entry.id === agent.id);
            if (idx >= 0) setActiveIndex(idx);
            handleSelect();
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
      <small className="chat-composer__hint">
        <span>{shortcutHint}</span>
        <span aria-hidden="true">·</span>
        <span>
          {hasResult
            ? "새 질문을 보내면 이전 결과는 메시지와 함께 숨겨집니다."
            : "중간발표 시연용 합성 데이터 · seed 20260729 · as_of 2026-07-30"}
        </span>
      </small>
    </form>
  );
}
