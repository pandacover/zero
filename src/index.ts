/**
 * Zero Agent - Main Entry Point & Exports
 */

export * from "./types.ts";
export * from "./tools.ts";
export * from "./providers.ts";
export * from "./config.ts";
export * from "./client.ts";
export * from "./session.ts";
export * from "./agent.ts";
export * from "./ui/spinner.ts";

import { runAgent } from "./agent.ts";
import { getGlobalDefaultProvider } from "./config.ts";
import { Session } from "./session.ts";
import { defaultTools } from "./tools.ts";

/**
 * Example quick-start function showing how to use the Agent generator programmatically.
 */
export async function exampleUsage() {
  const session = new Session({
    provider: getGlobalDefaultProvider(),
    tools: defaultTools,
  });

  const query = "List the files in the current directory using glob.";
  console.log(`\x1b[1m\x1b[34m[Query]\x1b[0m ${query}`);

  const generator = runAgent(query, session.getHistory(), session.getProvider(), {
    tools: session.getTools(),
  });

  for await (const event of generator) {
    switch (event.type) {
      case "think:start":
        console.log("  [Loader] Thinking...");
        break;
      case "think:complete":
        console.log(`  [Thought (${event.durationMs}ms)]:\n${event.thought}`);
        break;
      case "tool:start":
        console.log(`  [Loader] Executing tool '${event.toolName}' with args:`, event.args);
        break;
      case "tool:complete":
        console.log(`  [Tool Result (${event.durationMs}ms)]: ${event.result.slice(0, 100)}...`);
        break;
      case "response:start":
        console.log("  [Loader] Generating response...");
        break;
      case "response:complete":
        console.log(`\n\x1b[32m[Response]\x1b[0m\n${event.content}`);
        break;
      case "done":
        session.setHistory(event.history);
        console.log(`\n\x1b[90mTotal duration: ${event.totalDurationMs}ms\x1b[0m`);
        break;
      case "error":
        console.error(`  [Error] ${event.message}`);
        break;
    }
  }
}

if (import.meta.main) {
  exampleUsage().catch(console.error);
}
