// SSE client for the agent analysis stream. POSTs to the configured endpoint
// and parses `event:` / `data:` frames incrementally. Designed so the caller
// can drive the page state through the agentTrace reducer without needing to
// understand the wire format.

import { createUuid } from "../utils/createUuid.ts";
import { OPENAPI_VERSION } from "../contracts/analysis.ts";

export const SSE_ERROR_FALLBACK = "SSE_CONNECTION_FAILED";

export function parseSseChunk(buffer) {
  if (!buffer) return { events: [], rest: "" };
  const events = [];
  let cursor = 0;
  while (true) {
    const boundary = buffer.indexOf("\n\n", cursor);
    if (boundary === -1) break;
    const rawFrame = buffer.slice(cursor, boundary);
    cursor = boundary + 2;
    if (!rawFrame) continue;
    const dataLines = [];
    let eventName = "message";
    for (const line of rawFrame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const sep = line.indexOf(":");
      const field = sep === -1 ? line : line.slice(0, sep);
      const value = sep === -1 ? "" : line.slice(sep + 1).replace(/^ /, "");
      if (field === "event") eventName = value || "message";
      else if (field === "data") dataLines.push(value);
    }
    if (!dataLines.length) continue;
    const data = dataLines.join("\n");
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = { type: "raw", value: data };
    }
    events.push({ event: eventName, data: parsed });
  }
  return { events, rest: buffer.slice(cursor) };
}

export async function* openAgentStream({
  baseUrl,
  endpoint = "/api/v1/agent/analyze/stream",
  body,
  fetchImpl = (typeof fetch !== "undefined" ? fetch : null),
  headers = {},
  signal,
}) {
  if (!fetchImpl) throw new Error(SSE_ERROR_FALLBACK);
  const url = `${String(baseUrl || "").replace(/\/$/, "")}${endpoint}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Contract-Version": OPENAPI_VERSION,
      "X-Trace-Id": createUuid(),
      ...headers,
    },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(SSE_ERROR_FALLBACK);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    for (const event of events) yield event;
  }
  // Flush any final frame without trailing newline.
  if (buffer.trim().length) {
    const { events } = parseSseChunk(`${buffer}\n\n`);
    for (const event of events) yield event;
  }
}
