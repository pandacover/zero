# Zero Agent Loop

A decoupled, event-driven AI agent loop (**Query -> Model -> (Thinking / Tools) -> Response**) built with **Vanilla TypeScript** and **Bun**.

## Features

- **Effect-Native Stream Agent**: Implemented as a functional `Stream.Stream<AgentEvent, AgentError>` built on **Effect-TS**, yielding discrete lifecycle events (`think:start`, `think:complete`, `tool:start`, `tool:complete`, `response:complete`, `done`).
- **Structured Concurrency & Interruption**: Native Fiber management allowing instantaneous, safe abortion and steering without leaked child processes or promises.
- **Composable Service Layers**: Modular dependency injection via `LLMService` and `ToolService` layers.
- **Decoupled Session State**: Conversation history, active provider, and model configurations are completely isolated in a `Session` manager.
- **Built-in Coding Tools**:
  - `glob`: Fast file discovery matching patterns via `Bun.Glob`.
  - `grep`: Regex/text search across codebase files with line numbers.
  - `read`: Read file contents with line numbers and optional line slicing (`startLine`, `endLine`).
  - `write`: Create or overwrite files with automatic parent directory creation.
  - `edit`: Targeted substring search-and-replace for safe file edits with multi-section replacement.
  - `delete`: Delete files or directories.
  - `skill_discovery`: Discover tools and skills.
- **Universal OpenAI-Compatible Client**: Works with OpenAI, Groq, Ollama, OpenRouter, DeepSeek, LM Studio, or any custom endpoint.

---

## Quick Start

### 1. Launch the Interactive CLI
```bash
bun run cli
```

### 2. Run Tests
```bash
bun test
```

### 3. Programmatic Usage

```typescript
import { Effect, Stream } from "effect";
import { runAgent, createAgentLayer, Session, getGlobalDefaultProvider, defaultTools } from "./src/index.ts";

const session = new Session({
  provider: getGlobalDefaultProvider(),
  tools: defaultTools,
});

const query = "Search for files ending in .ts using glob and summarize them";

const stream = runAgent(query, session.getHistory(), session.getProvider(), {
  systemPrompt: session.getSystemPrompt(),
});

const agentLayer = createAgentLayer({ tools: session.getTools() });

const program = stream.pipe(
  Stream.runForEach((event) =>
    Effect.sync(() => {
      if (event.type === "tool:start") {
        console.log(`Executing ${event.toolName}...`);
      } else if (event.type === "tool:complete") {
        console.log(`Tool ${event.toolName} finished in ${event.durationMs}ms`);
      } else if (event.type === "response:complete") {
        console.log(`Agent: ${event.content}`);
      } else if (event.type === "done") {
        session.setHistory(event.history);
      }
    })
  ),
  Effect.provide(agentLayer)
);

await Effect.runPromise(program);
```
