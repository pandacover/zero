import { Effect, Ref, Stream } from "effect";
import type { AgentEvent, Message, ProviderConfig, ToolCall } from "../types.ts";
import {
  type AgentError,
  MaxStepsExceededError,
  ModelInvocationError,
  ToolExecutionError,
} from "./errors.ts";
import { buildWorkingHistory } from "./history.ts";
import { LLMService, ToolService } from "./services.ts";

export const DEFAULT_MAX_STEPS = 100;

export interface RunAgentOptions {
  systemPrompt?: string;
  maxSteps?: number;
}

/**
 * Safely parses JSON arguments for tool calls, falling back to a raw wrapper.
 */
export function parseToolArguments(rawArgs: string | undefined): Record<string, any> {
  if (!rawArgs || typeof rawArgs !== "string" || !rawArgs.trim()) {
    return {};
  }
  try {
    return JSON.parse(rawArgs);
  } catch {
    return { raw: rawArgs };
  }
}

/**
 * Pure Effect Stream representing the autonomous agent loop.
 * Yields discrete AgentEvent objects (think, tool, response, done, error).
 */
export function runAgent(
  query: string,
  history: readonly Message[] = [],
  config: ProviderConfig,
  options?: RunAgentOptions
): Stream.Stream<AgentEvent, AgentError, LLMService | ToolService> {
  return Stream.asyncPush<AgentEvent, AgentError, LLMService | ToolService>((emit) =>
    Effect.forkScoped(
      Effect.gen(function* () {
      const llm = yield* LLMService;
      const toolService = yield* ToolService;
      const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
      const totalStart = Date.now();

      // Mutable state tracked safely in an Effect Ref
      const historyRef = yield* Ref.make<Message[]>(
        buildWorkingHistory(query, history, options?.systemPrompt)
      );

      let step = 0;

      while (step < maxSteps) {
        step++;
        const stepStart = Date.now();

        // 1. Emit progress indicator
        if (config.supportsReasoning) {
          emit.single({ type: "think:start" });
        } else {
          emit.single({ type: "response:start" });
        }

        // 2. Call LLM with current working history
        const currentHistory = yield* Ref.get(historyRef);
        const toolsList = toolService.getTools();
        const response = yield* llm
          .callChatCompletion(currentHistory, config, toolsList.length > 0 ? toolsList : undefined)
          .pipe(
            Effect.catchAll((err) => {
              emit.single({
                type: "error",
                message: err.message,
                phase: "model",
              });
              emit.fail(err);
              return Effect.fail(err);
            })
          );

        const stepDuration = Date.now() - stepStart;

        // 3. Emit thinking event if reasoning content was provided
        if (response.reasoning) {
          emit.single({
            type: "think:complete",
            thought: response.reasoning,
            durationMs: stepDuration,
          });
        }

        // 4. Handle Tool Calls if the model requested any
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Record assistant message with tool calls in history
          yield* Ref.update(historyRef, (hist) => [
            ...hist,
            {
              role: "assistant" as const,
              content: response.content,
              thought: response.reasoning || undefined,
              tool_calls: response.tool_calls,
            },
          ]);

          // Execute each tool call
          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            const args = parseToolArguments(toolCall.function.arguments);

            emit.single({
              type: "tool:start",
              toolName,
              args,
              callId: toolCall.id,
            });

            const toolStart = Date.now();
            const result = yield* toolService.execute(toolName, args).pipe(
              Effect.catchAll((err) => {
                emit.single({
                  type: "error",
                  message: err.error,
                  phase: "tool",
                });
                emit.fail(err);
                return Effect.fail(err);
              })
            );

            const toolDuration = Date.now() - toolStart;
            let parsedResponse: any = undefined;
            try {
              parsedResponse = JSON.parse(result);
            } catch {
              // Non-JSON string output
            }

            emit.single({
              type: "tool:complete",
              toolName,
              args,
              result,
              durationMs: toolDuration,
              callId: toolCall.id,
              parsed: parsedResponse,
            });

            yield* Ref.update(historyRef, (hist) => [
              ...hist,
              {
                role: "tool" as const,
                content: result,
                tool_call_id: toolCall.id,
                name: toolName,
              },
            ]);
          }

          // Continue loop to pass tool outputs back to LLM
          continue;
        }

        // 5. Final completion response (no tool calls)
        const finalResponse = response.content || "";

        emit.single({
          type: "response:complete",
          content: finalResponse,
          durationMs: stepDuration,
          usage: response.usage,
        });

        const finalHistory = yield* Ref.updateAndGet(historyRef, (hist) => [
          ...hist,
          {
            role: "assistant" as const,
            content: finalResponse,
            thought: response.reasoning || undefined,
          },
        ]);

        const totalDurationMs = Date.now() - totalStart;

        emit.single({
          type: "done",
          finalResponse,
          history: finalHistory,
          totalDurationMs,
        });

        emit.end();
        return;
      }

      // Max steps limit reached
      const limitError = new MaxStepsExceededError({ maxSteps });
      const timeoutMessage = `Agent exceeded maximum execution steps limit (${maxSteps}).`;
      emit.single({
        type: "error",
        message: timeoutMessage,
        phase: "response",
      });
      emit.fail(limitError);
    })
    )
  );
}
