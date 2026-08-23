// Client-side persistence layer for the analysis → report artifact bridge.
// Wraps the existing `answervice.report.artifact` sessionStorage key so the
// ReportsPage can keep reading it unchanged, while giving the AgentPage a
// small typed surface that survives reloads via localStorage.

import { buildDraftFromRun } from "./reportBridge.js";

const STORAGE_KEY = "answervice.agent.draft";
const SESSION_STORAGE_KEY = "answervice.report.artifact";

function safeStorage(get, set, key, value) {
  try {
    set(key, value);
    return get(key);
  } catch {
    return null;
  }
}

export function readStoredDraft(storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredDraft(draft, storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  if (!storage || !draft) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredDraft(storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// Bridge an AnalysisRun into the existing sessionStorage payload the
// ReportsPage initialEditorBlocks already understands. Returns the payload so
// the caller can show a confirmation banner.
export function publishArtifactToSession(run, storage = (typeof sessionStorageShim() === "function" ? sessionStorageShim()() : (typeof window !== "undefined" ? window.sessionStorage : null))) {
  if (!run || !run.artifact?.artifactId || !storage) return null;
  const payload = {
    artifactId: run.artifact.artifactId,
    queryId: run.artifact.queryId,
    question: run.question,
    sourceUrns: (run.sources ?? []).map((source) => source.urn),
  };
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Session storage unavailable (e.g. SSR); the caller's UI still has the draft.
  }
  return payload;
}

function sessionStorageShim() {
  return typeof window !== "undefined" ? () => window.sessionStorage : null;
}

// Compose the full draft lifecycle: build → persist → publish. Pure-ish;
// reads from `run` only. The `createReportRun` factory is passed in so the
// caller controls when the run is constructed and where its id comes from.
export function stageArtifact(run, options = {}) {
  const draft = buildDraftFromRun(run, {
    definitionId: options.definitionId,
    title: options.title ?? "분석 자동 보고서 초안",
  });
  writeStoredDraft(draft, options.storage);
  const sessionPayload = publishArtifactToSession(run, options.sessionStorage);
  return { draft, sessionPayload };
}
