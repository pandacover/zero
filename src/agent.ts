import type {
  AgentEvent,
  AgentResult,
  Message,
  ProviderConfig,
  Tool,
} from "./types.ts";
import { OpenAICompatibleClient } from "./client.ts";
import { ToolRegistry } from "./tools.ts";

export interface AgentRunOptions {
  systemPrompt?: string;
  tools?: Tool[];
  maxSteps?: number;
  client?: OpenAICompatibleClient;
}

export class Agent {
  /**
   * Pure AsyncGenerator that runs the agent loop.
   * Emits discrete completed events (think, tool, response, done, error).
   */
  static async *run(
    query: string,
    history: readonly Message[],
    config: ProviderConfig,
    options?: AgentRunOptions
  ): AsyncGenerator<AgentEvent, AgentResult, void> {
    const totalStart = Date.now();
    const client = options?.client ?? new OpenAICompatibleClient();
    const tools = options?.tools;
    const toolRegistry = tools && tools.length > 0 ? new ToolRegistry(tools) : null;
    const maxSteps = options?.maxSteps ?? 10;

    // Construct working history payload
    const workingHistory: Message[] = [];

    // Include system prompt if provided
    if (options?.systemPrompt) {
      workingHistory.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // Add prior session history
    workingHistory.push(...history);

    // Add the new user query
    workingHistory.push({
      role: "user",
      content: query,
    });

    let step = 0;
    let finalResponse = "";

    try {
      while (step < maxSteps) {
        step++;
        const stepStart = Date.now();

        // If reasoning is supported or model might think, emit think:start loader
        if (config.supportsReasoning) {
          yield { type: "think:start" };
        } else {
          yield { type: "response:start" };
        }

        // Call the LLM
        let response;
        try {
          response = await client.callChatCompletion(workingHistory, config, tools);
        } catch (err: any) {
          yield {
            type: "error",
            message: err.message || String(err),
            phase: "model",
          };
          throw err;
        }

        const stepDuration = Date.now() - stepStart;

        // If reasoning content exists, emit completed thinking event
        if (response.reasoning) {
          yield {
            type: "think:complete",
            thought: response.reasoning,
            durationMs: stepDuration,
          };
        }

        // Check for tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Record assistant message with tool calls
          workingHistory.push({
            role: "assistant",
            content: response.content,
            tool_calls: response.tool_calls,
          });

          // Execute each tool call sequentially
          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            let args: Record<string, any> = {};

            try {
              args = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              args = { raw: toolCall.function.arguments };
            }

            // Emit tool start event (shows loader in CLI)
            yield {
              type: "tool:start",
              toolName,
              args,
              callId: toolCall.id,
            };

            const toolStart = Date.now();
            let result = "";

            if (toolRegistry) {
              result = await toolRegistry.execute(toolName, args);
            } else {
              result = `Error: No tools registered in agent session.`;
            }

            const toolDuration = Date.now() - toolStart;

            // Emit completed tool event (stops loader and displays result in CLI)
            yield {
              type: "tool:complete",
              toolName,
              args,
              result,
              durationMs: toolDuration,
              callId: toolCall.id,
            };

            // Append tool response to message history
            workingHistory.push({
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
              name: toolName,
            });
          }

          // Loop back to send tool results to the model
          continue;
        }

        // If no tool calls, this is the final response
        finalResponse = response.content || "";

        yield {
          type: "response:complete",
          content: finalResponse,
          durationMs: stepDuration,
          usage: response.usage,
        };

        // Append assistant's final response to history
        workingHistory.push({
          role: "assistant",
          content: finalResponse,
        });

        const totalDurationMs = Date.now() - totalStart;

        yield {
          type: "done",
          finalResponse,
          history: workingHistory,
          totalDurationMs,
        };

        return {
          finalResponse,
          history: workingHistory,
          totalDurationMs,
          steps: step,
        };
      }

      // Max steps exceeded
      const timeoutError = `Agent exceeded maximum execution steps limit (${maxSteps}).`;
      yield {
        type: "error",
        message: timeoutError,
        phase: "response",
      };

      throw new Error(timeoutError);
    } catch (err: any) {
      yield {
        type: "error",
        message: err.message || String(err),
        phase: "response",
      };
      throw err;
    }
  }
}
