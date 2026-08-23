import { useEffect, useRef, useState } from "react";
import { AGENT_LIST } from "../../lib/agents.js";

const ARROW_UP = "ArrowUp";
const ARROW_DOWN = "ArrowDown";

export function AgentPicker({ open, anchorRef, onPick, onClose }) {
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setActive(0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === ARROW_DOWN) {
        event.preventDefault();
        setActive((current) => Math.min(AGENT_LIST.length - 1, current + 1));
      } else if (event.key === ARROW_UP) {
        event.preventDefault();
        setActive((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const pick = AGENT_LIST[active];
        if (pick) onPick(pick);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [open, active, onPick, onClose]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.querySelector(`[data-index="${active}"]`);
    if (item && typeof item.scrollIntoView === "function") {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [active, open]);

  if (!open) return null;
  return (
    <div
      className="agent-picker"
      role="listbox"
      aria-label="에이전트 선택"
      ref={listRef}
      style={anchorRef?.current ? { left: 0, top: "100%" } : undefined}
    >
      {AGENT_LIST.map((agent, index) => (
        <button
          key={agent.id}
          type="button"
          role="option"
          aria-selected={index === active}
          data-index={index}
          className={`agent-picker__item ${index === active ? "agent-picker__item--active" : ""}`}
          style={{ "--agent-hue": agent.hue }}
          onMouseEnter={() => setActive(index)}
          onClick={() => onPick(agent)}
        >
          <span className="agent-picker__dot" aria-hidden="true" />
          <span className="agent-picker__body">
            <b>{agent.name}</b>
            <small>{agent.role}</small>
          </span>
          <em>@{agent.id}</em>
        </button>
      ))}
    </div>
  );
}