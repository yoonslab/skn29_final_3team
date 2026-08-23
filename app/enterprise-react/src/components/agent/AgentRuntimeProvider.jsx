import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from "@assistant-ui/react";
import "../../ai-chat.css";
import { createAgentChatAdapter } from "../../api/agentRuntimeAdapter.js";
import { AgentRuntimeContext } from "./agentRuntimeContext.js";

// Bridges SSE agent frames into @assistant-ui/react's `useLocalRuntime` while
// the page keeps its own timeline/delegation/result state via the `onFrame`
// callback. When HTTP is not preferred (the default), the adapter yields an
// empty content part so the page's own playFixtureFlow stays the source of
// truth for the visible bubbles.
export function AgentRuntimeProvider({
  initialMessages,
  onFrame,
  preferHttp,
  baseUrl,
  children,
}) {
  const adapter = useMemo(
    () => createAgentChatAdapter({ baseUrl, onFrame }),
    [baseUrl, onFrame],
  );
  const runtime = useLocalRuntime(wrapAdapter(adapter, preferHttp), {
    initialMessages,
  });

  const sendUserMessage = useMemo(() => {
    return (text) => {
      if (typeof text !== "string" || !text.trim()) return;
      runtime.thread.append({ role: "user", content: [{ type: "text", text }] });
    };
  }, [runtime]);

  const contextValue = useMemo(() => ({ sendUserMessage }), [sendUserMessage]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AgentRuntimeContext.Provider value={contextValue}>
        <AgentThreadChrome />
        {children}
      </AgentRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
}

function AgentThreadChrome() {
  return (
    <ThreadPrimitive.Root className="au-thread-root au-thread-root--hidden">
      <ThreadPrimitive.Viewport className="au-thread-viewport">
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <ThreadPrimitive.ScrollToBottom />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="au-message au-message--user">
      <div className="au-message__body">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="au-message au-message--assistant">
      <div className="au-message__body">
        <MessagePrimitive.Parts components={{ Text: AssistantText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantText() {
  return (
    <MessagePartPrimitive.Text className="au-message__text au-message__text--assistant" />
  );
}

// When preferHttp is off, swap the run() generator for one that yields an
// empty content part. The page drives the rich delegation/trace/result
// rendering through its own state machine (the existing playFixtureFlow),
// so the runtime-side bubble stays empty by design.
function wrapAdapter(adapter, preferHttp) {
  if (preferHttp) return adapter;
  return {
    async *run() {
      yield { content: [{ type: "text", text: "" }] };
    },
  };
}
