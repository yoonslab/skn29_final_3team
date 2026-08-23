// Multi-agent roster + mention parsing + question routing for the chat-style
// analysis page. Pure, side-effect free so tests can exercise every branch.

export const AGENTS = Object.freeze({
  coordinator: { id: "coordinator", name: "코디네이터", role: "요청 분배와 결과 종합", hue: 250 },
  analyst:     { id: "analyst",     name: "데이터 분석가", role: "지표 분석과 SQL 실행", hue: 200 },
  reporter:    { id: "reporter",    name: "리포트 작성가", role: "보고서 초안 구성", hue: 160 },
  steward:     { id: "steward",     name: "데이터 큐레이터", role: "카탈로그와 메타데이터 안내", hue: 30 },
});

export const AGENT_IDS = Object.freeze(Object.keys(AGENTS));
export const AGENT_LIST = Object.freeze(AGENT_IDS.map((id) => AGENTS[id]));

function unique(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// Resolve an `@mention` token to the canonical agent id. Supports the
// canonical id, the full Korean name (with or without spaces), and unique
// prefixes so that `@데이터` still resolves to "데이터 분석가".
export function resolveMentionToken(token) {
  if (typeof token !== "string") return null;
  const normalized = token.replace(/^@/, "").replace(/\s+/g, "").toLowerCase();
  if (!normalized) return null;
  for (const agent of AGENT_LIST) {
    if (agent.id === normalized) return agent.id;
    const compactName = agent.name.replace(/\s+/g, "").toLowerCase();
    if (compactName === normalized) return agent.id;
  }
  // Unique-prefix fallback: only match when the prefix resolves to exactly
  // one agent so that `@분`(shared between nothing) never resolves to a wrong
  // agent.
  const prefixMatches = AGENT_LIST.filter((agent) => {
    const compactName = agent.name.replace(/\s+/g, "").toLowerCase();
    return compactName.startsWith(normalized) || agent.id.startsWith(normalized);
  });
  if (prefixMatches.length === 1) return prefixMatches[0].id;
  return null;
}

// Capture `@<name|id>` tokens in Korean multi-word form (e.g. "데이터 분석가").
// Each `@...` anchor grabs all consecutive letter/digit/space characters,
// then we shrink the candidate one word at a time until resolveMentionToken
// finds an agent — this stops `@steward 카탈로그` from swallowing "카탈로그".
export function parseMentions(text) {
  if (typeof text !== "string" || !text) return [];
  const matches = [];
  const seen = new Set();
  const anchor = /@(?:[\p{L}\p{N}_-]+\s)*[\p{L}\p{N}_-]+/gu;
  let anchorMatch;
  while ((anchorMatch = anchor.exec(text)) !== null) {
    const raw = anchorMatch[0].slice(1);
    const words = raw.split(/\s+/).filter(Boolean);
    let resolved = null;
    for (let end = words.length; end > 0; end -= 1) {
      const candidate = words.slice(0, end).join(" ");
      const id = resolveMentionToken(candidate);
      if (id) { resolved = id; break; }
    }
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      matches.push(resolved);
    }
  }
  return matches;
}

// Reason code describing why a target was chosen. Useful for the UI footer
// ("reason" line) and for tests asserting routing determinism.
export const ROUTE_REASON = Object.freeze({
  MENTION: "mention",
  KEYWORD_REPORTER: "keyword:reporter",
  KEYWORD_STEWARD: "keyword:steward",
  KEYWORD_ANALYST: "keyword:analyst",
  DEFAULT_ANALYST: "default:analyst",
});

// Keyword fallback buckets. Order matters: first match wins, so the more
// specific reporter/steward buckets are checked before the analyst default.
const KEYWORD_RULES = [
  {
    target: "reporter",
    reason: ROUTE_REASON.KEYWORD_REPORTER,
    patterns: ["리포트", "보고서", "정리"],
  },
  {
    target: "steward",
    reason: ROUTE_REASON.KEYWORD_STEWARD,
    patterns: ["카탈로그", "메타데이터", "원천", "데이터셋"],
  },
];

function findKeywordTarget(text) {
  if (typeof text !== "string") return null;
  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (text.includes(pattern)) return { target: rule.target, reason: rule.reason, pattern };
    }
  }
  return null;
}

// Decide which agents should respond to the question.
//
// Precedence: explicit @mentions > keyword buckets > default analyst.
// The coordinator always participates as delegator unless the user @mentioned
// only the coordinator — in that case the coordinator answers alone.
export function routeQuestion(text) {
  const mentions = parseMentions(text);
  if (mentions.length > 0) {
    const onlyCoordinator = mentions.length === 1 && mentions[0] === "coordinator";
    const targets = onlyCoordinator ? ["coordinator"] : unique(["coordinator", ...mentions]);
    return { targets, reason: ROUTE_REASON.MENTION, mentions, source: "mention" };
  }
  const fallback = findKeywordTarget(text);
  if (fallback) {
    const targets = fallback.target === "coordinator"
      ? ["coordinator"]
      : unique(["coordinator", fallback.target]);
    return {
      targets,
      reason: fallback.reason,
      mentions: [],
      source: fallback.target,
    };
  }
  return {
    targets: ["coordinator", "analyst"],
    reason: ROUTE_REASON.DEFAULT_ANALYST,
    mentions: [],
    source: "analyst",
  };
}

// Helper used by the UI to render agent metadata. Stable order: coordinator
// first, then analyst / reporter / steward in the order they appear in the
// roster.
export function orderAgents(ids) {
  if (!Array.isArray(ids)) return [];
  return unique(ids).sort((a, b) => {
    if (a === b) return 0;
    if (a === "coordinator") return -1;
    if (b === "coordinator") return 1;
    return AGENT_IDS.indexOf(a) - AGENT_IDS.indexOf(b);
  });
}