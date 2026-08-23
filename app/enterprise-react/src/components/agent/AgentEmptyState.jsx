import { ArrowRight } from "lucide-react";
import { SUGGESTIONS } from "../../lib/suggestions.js";

// Centered first-run empty state. Shown only while no submission has been
// attempted yet so it never collides with the active conversation timeline.
export function AgentEmptyState({ onPick }) {
  const handlePick = (label) => {
    if (typeof onPick === "function") onPick(label);
  };
  return (
    <section
      className="chat-zone chat-zone--empty"
      aria-labelledby="chat-zone-wordmark"
      aria-describedby="chat-zone-value"
    >
      <div className="chat-zone__hero">
        <h2 id="chat-zone-wordmark" className="chat-zone__wordmark">ANSWERVICE</h2>
        <p id="chat-zone-value" className="chat-zone__value">
          여러 원천의 운영 데이터를 질문 한 번으로 검증된 분석과 보고서로.
        </p>
      </div>
      <div className="chat-zone__chips" role="group" aria-label="추천 질문">
        {SUGGESTIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="chat-zone__chip"
            onClick={() => handlePick(entry.label)}
          >
            <span className="chat-zone__chip-body">{entry.label}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
