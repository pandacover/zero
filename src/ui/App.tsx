import React, { useRef, useState } from "react";
import { type CliRenderer } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { Effect, Fiber, Stream } from "effect";
import { runAgent } from "../agent/runner.ts";
import { createAgentLayer } from "../agent/services.ts";
import { Session } from "../session.ts";
import { Composer } from "./components/Composer.tsx";
import { MessageList, type ChatTurnItem } from "./components/MessageList.tsx";

export interface AppProps {
  renderer: CliRenderer;
}

export function App({ renderer }: AppProps) {
  const [session, setSession] = useState(() => Session.createNew());
  const [items, setItems] = useState<ChatTurnItem[]>(() => {
    return session.getHistory().map((m, idx) => ({
      id: `init_${idx}`,
      type: m.role === "user" ? ("user" as const) : ("agent" as const),
      content: m.content || "",
    }));
  });
  const [isBusy, setIsBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const activeFiberRef = useRef<Fiber.RuntimeFiber<any, any> | null>(null);

  const provider = session.getProvider();

  const handleInterrupt = () => {
    if (activeFiberRef.current) {
      Effect.runFork(Fiber.interrupt(activeFiberRef.current));
      activeFiberRef.current = null;
    }
    setIsBusy(false);
    setStatusText("Stopped");
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36),
        type: "system",
        content: "[Generation stopped by user]",
      },
    ]);
  };

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (isBusy) {
        handleInterrupt();
      }
    } else if (key.ctrl && (key.name === "c" || key.name === "q")) {
      if (isBusy) {
        handleInterrupt();
      } else {
        session.save();
        renderer.destroy();
        process.exit(0);
      }
    }
  });

  const handleSend = (query: string) => {
    if (!query || isBusy) return;

    // Handle Slash Commands
    if (query.startsWith("/")) {
      const parts = query.split(" ");
      const cmd = parts[0]!.toLowerCase();

      switch (cmd) {
        case "/exit":
        case "/quit":
          session.save();
          renderer.destroy();
          process.exit(0);
          return;

        case "/clear":
        case "/reset":
          session.clearHistory();
          setItems([]);
          return;

        case "/new": {
          const fresh = Session.createNew();
          setSession(fresh);
          setItems([]);
          return;
        }

        case "/help":
          setItems((prev) => [
            ...prev,
            {
              id: Math.random().toString(36),
              type: "system",
              content:
                "Zero Agent Commands:\n" +
                "  /clear  - Clear conversation history\n" +
                "  /new    - Start a fresh session\n" +
                "  /help   - Display this help message\n" +
                "  /exit   - Exit the application\n" +
                "  Esc     - Cancel running agent\n" +
                "  Ctrl+C  - Exit or stop",
            },
          ]);
          return;
      }
    }

    // Normal query
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36),
        type: "user",
        content: query,
      },
    ]);

    const priorHistory = session.getHistory();
    session.addMessage({ role: "user", content: query });
    const turn = session.startTurn(query);

    setIsBusy(true);
    setStatusText("⠋ Thinking...");

    const stream = runAgent(query, priorHistory, provider, {
      systemPrompt: session.getSystemPrompt(),
    });

    const agentLayer = createAgentLayer({
      tools: session.getTools(),
    });

    const program = stream.pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          switch (event.type) {
            case "think:start":
              setStatusText("⠋ Thinking...");
              break;

            case "think:complete":
              setStatusText("");
              setItems((prev) => [
                ...prev,
                {
                  id: Math.random().toString(36),
                  type: "think",
                  thought: event.thought,
                  durationMs: event.durationMs,
                },
              ]);
              session.recordTurnStep(turn.turnIndex, {
                type: "think",
                thought: event.thought,
                durationMs: event.durationMs,
              });
              break;

            case "tool:start":
              setStatusText(`⚡ Tool '${event.toolName}'...`);
              break;

            case "tool:complete": {
              let parsed: any;
              try {
                parsed = JSON.parse(event.result);
              } catch {}
              setItems((prev) => [
                ...prev,
                {
                  id: Math.random().toString(36),
                  type: "tool",
                  toolName: event.toolName,
                  args: event.args,
                  result:
                    event.result.length > 500
                      ? event.result.slice(0, 500) + "..."
                      : event.result,
                  durationMs: event.durationMs,
                  outcome: parsed?.outcome || parsed?.toolStatus,
                },
              ]);
              session.recordTurnStep(turn.turnIndex, {
                type: "tool",
                toolName: event.toolName,
                args: event.args,
                callId: event.callId,
                result: event.result,
                durationMs: event.durationMs,
                toolStatus: parsed?.toolStatus,
                outcome: parsed?.outcome,
              });
              setStatusText("");
              break;
            }

            case "response:start":
              setStatusText("⠋ Generating response...");
              break;

            case "response:complete":
              setStatusText("");
              setItems((prev) => [
                ...prev,
                {
                  id: Math.random().toString(36),
                  type: "agent",
                  content: event.content,
                  durationMs: event.durationMs,
                },
              ]);
              session.recordTurnStep(turn.turnIndex, {
                type: "response",
                content: event.content,
                durationMs: event.durationMs,
                usage: event.usage,
              });
              break;

            case "done":
              session.setHistory(event.history);
              session.completeTurn(turn.turnIndex, {
                status: "success",
                finalResponse: event.finalResponse,
                totalDurationMs: event.totalDurationMs,
              });
              setIsBusy(false);
              setStatusText("");
              break;

            case "error":
              setItems((prev) => [
                ...prev,
                {
                  id: Math.random().toString(36),
                  type: "error",
                  message: event.message,
                },
              ]);
              session.recordTurnStep(turn.turnIndex, {
                type: "error",
                message: event.message,
                phase: event.phase,
              });
              session.completeTurn(turn.turnIndex, {
                status: "error",
                error: { message: event.message, phase: event.phase },
              });
              setIsBusy(false);
              setStatusText("");
              break;
          }
        })
      ),
      Effect.provide(agentLayer),
      Effect.catchAll((err) =>
        Effect.sync(() => {
          setItems((prev) => [
            ...prev,
            {
              id: Math.random().toString(36),
              type: "error",
              message: err instanceof Error ? err.message : String(err),
            },
          ]);
          setIsBusy(false);
          setStatusText("");
        })
      )
    );

    const fiber = Effect.runFork(program);
    activeFiberRef.current = fiber;
  };

  return (
    <box flexDirection="column" width="100%" height="100%">
      <MessageList items={items} />
      <Composer
        sessionId={session.id}
        providerName={provider.name}
        modelName={provider.model}
        statusText={statusText}
        isBusy={isBusy}
        onSend={handleSend}
        onInterrupt={handleInterrupt}
      />
    </box>
  );
}
