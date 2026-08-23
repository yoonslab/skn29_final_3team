// Tiny context module shared by the page and the runtime provider. Lives in
// its own file (no assistant-ui imports) so that the page can call
// useAgentRuntime() in the eager chunk without dragging the assistant-ui
// runtime + tailwind utilities into the same bundle.

import { createContext, useContext } from "react";

export const AgentRuntimeContext = createContext({ sendUserMessage: null });

export function useAgentRuntime() {
  return useContext(AgentRuntimeContext);
}
