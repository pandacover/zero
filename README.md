# Zero Agent Loop

A decoupled, event-driven AI agent loop (**Query -> Model -> (Thinking / Tools) -> Response**) built with **Vanilla TypeScript** and **Bun**.

## Features

- **Stateless Generator Agent**: Implemented as an `AsyncGenerator` yielding discrete lifecycle events (`think:start`, `think:complete`, `tool:start`, `tool:complete`, `response:start`, `response:complete`, `done`).
- **Decoupled Session State**: Conversation history, active provider, and model configurations are completely isolated in a `Session` manager.
- **Built-in Coding Tools**:
  - `glob`: Fast file discovery matching patterns via `Bun.Glob`.
  - `grep`: Regex/text search across codebase files with line numbers.
  - `read`: Read file contents with line numbers and optional line slicing (`startLine`, `endLine`).
  - `write`: Create or overwrite files with automatic parent directory creation.
  - `edit`: Targeted substring search-and-replace for safe file edits.
- **Universal OpenAI-Compatible Client**: Works with OpenAI, Groq, Ollama, OpenRouter, DeepSeek, LM Studio, or any custom endpoint.
- **Interactive CLI REPL**:
  - `/provider`: Switch provider and configure API keys & base URLs.
  - `/model`: Select model from presets or discover live models from `/v1/models`.
  - `/tools`: View active tools.
  - `/config`: Inspect active provider, model, and key status.
  - `/history`: View session conversation history.
  - `/clear`: Clear conversation memory.
  - `/help`: Display available commands.
  - `/exit`: Exit the REPL.

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
import { Agent, Session, getDefaultProvider, defaultTools } from "./src/index.ts";

const session = new Session({
  provider: getDefaultProvider(),
  tools: defaultTools,
});

const query = "Search for files ending in .ts using glob and summarize them";

const generator = Agent.run(query, session.getHistory(), session.getProvider(), {
  tools: session.getTools(),
});

for await (const event of generator) {
  if (event.type === "tool:start") {
    console.log(`Executing ${event.toolName}...`);
  } else if (event.type === "tool:complete") {
    console.log(`Tool ${event.toolName} finished in ${event.durationMs}ms`);
  } else if (event.type === "response:complete") {
    console.log(`Agent: ${event.content}`);
  } else if (event.type === "done") {
    session.setHistory(event.history);
  }
}
```
