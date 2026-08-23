// Lazy-loaders for the assistant-ui runtime bridge. Importing this module
// alone does not pull `@assistant-ui/react` or `tailwindcss` into the
// initial chunk; the page wraps it in <Suspense> so the static shell renders
// first and the chat runtime arrives asynchronously after first paint.

import { lazy } from "react";

export const LazyAgentRuntimeProvider = lazy(async () => {
  const module = await import("./AgentRuntimeProvider.jsx");
  return { default: module.AgentRuntimeProvider };
});
