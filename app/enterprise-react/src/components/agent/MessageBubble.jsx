import { AGENT_LIST, orderAgents } from "../../lib/agents.js";

const TONE_LABEL = {
  waiting: "대기",
  running: "실행 중",
  done: "완료",
  blocked: "차단",
  failed: "실패",
};

// Maps delegation status to the Korean verb the user sees in the delegation
// card body. The page uses these instead of the raw status so the
// microcopy stays in 합니다체 ("위임했습니다" / "완료했습니다") for a calm
// enterprise tone.
const TONE_VERB = {
  waiting: "위임했습니다",
  running: "실행 중입니다",
  done: "완료했습니다",
  blocked: "차단되었습니다",
  failed: "실패했습니다",
};

function resolveAgent(id) {
  return AGENT_LIST.find((entry) => entry.id === id) ?? null;
}

export function AgentBadge({ id }) {
  const agent = resolveAgent(id);
  if (!agent) return null;
  return (
    <span className="agent-badge" style={{ "--agent-hue": agent.hue }} aria-label={agent.name}>
      <span className="agent-badge__dot" aria-hidden="true" />
      {agent.name}
    </span>
  );
}

export function AgentAvatar({ id }) {
  const agent = resolveAgent(id);
  if (!agent) return null;
  return (
    <span className="agent-avatar" style={{ "--agent-hue": agent.hue }} aria-hidden="true">
      {agent.name.slice(0, 1)}
    </span>
  );
}

export function DelegationCard({ delegation, status }) {
  if (!delegation) return null;
  const orderedTargets = orderAgents(delegation.targets ?? []);
  const coordinatorId = orderedTargets[0] ?? "coordinator";
  const coordinator = resolveAgent(coordinatorId);
  const targetIds = orderedTargets.filter((id) => id !== coordinatorId);
  const summary = delegation.summary ?? delegation.question ?? "";
  const verb = TONE_VERB[status] ?? TONE_VERB.waiting;
  return (
    <article className={`delegation-card delegation-card--${status}`} aria-live="polite">
      <span className="delegation-card__symbol" aria-hidden="true">◈</span>
      <div>
        <header>
          <AgentBadge id={coordinatorId} />
          <span aria-hidden="true">→</span>
          {targetIds.length === 0 ? (
            <em>단독 응답</em>
          ) : (
            targetIds.map((id) => <AgentBadge key={id} id={id} />)
          )}
          <em className={`delegation-card__status delegation-card__status--${status}`}>{TONE_LABEL[status] ?? status}</em>
        </header>
        <p>
          {coordinator ? `${coordinator.name}이(가) ${verb}` : "위임이 시작되었습니다"} · {summary}
        </p>
        <small>reason · {delegation.reason ?? "default"}</small>
      </div>
    </article>
  );
}

export function MessageBubble({ message, children }) {
  const isUser = message.author === "user";
  const orderedAgents = orderAgents(message.agents ?? []);
  return (
    <article
      className={`message-bubble ${isUser ? "message-bubble--user" : "message-bubble--agent"} message-bubble--${message.kind ?? "text"}`}
      style={orderedAgents[0] && !isUser ? { "--agent-hue": resolveAgent(orderedAgents[0])?.hue ?? 200 } : undefined}
      data-author={message.author}
      data-agents={orderedAgents.join(",")}
    >
      {!isUser && orderedAgents[0] ? (
        <AgentAvatar id={orderedAgents[0]} />
      ) : (
        <span className="message-bubble__user-mark" aria-hidden="true">나</span>
      )}
      <div className="message-bubble__body">
        <header>
          <b>{isUser ? "사용자" : orderedAgents.map((id) => resolveAgent(id)?.name ?? id).join(" · ")}</b>
          {!isUser && orderedAgents.length > 1 ? (
            <small>{orderedAgents.length}명 협업</small>
          ) : null}
        </header>
        {children}
      </div>
    </article>
  );
}