import { Context, Effect, Layer } from "effect";
import { OpenAICompatibleClient } from "../client.ts";
import { ToolRegistry } from "../tools.ts";
import type { LLMResponse, Message, ProviderConfig, Tool } from "../types.ts";
import { ModelInvocationError, ToolExecutionError } from "./errors.ts";

/**
 * Effect Service Tag for invoking LLM chat completions.
 */
export class LLMService extends Context.Tag("LLMService")<
  LLMService,
  {
    readonly callChatCompletion: (
      messages: Message[],
      config: ProviderConfig,
      tools?: Tool[]
    ) => Effect.Effect<LLMResponse, ModelInvocationError>;
  }
>() {}

/**
 * Effect Service Tag for executing tools against a registry.
 */
export class ToolService extends Context.Tag("ToolService")<
  ToolService,
  {
    readonly execute: (
      name: string,
      args: Record<string, any>
    ) => Effect.Effect<string, ToolExecutionError>;
    readonly getTools: () => Tool[];
  }
>() {}

/**
 * Creates a live LLMService layer using an OpenAICompatibleClient instance.
 */
export function createLiveLLMLayer(
  client: OpenAICompatibleClient = new OpenAICompatibleClient()
): Layer.Layer<LLMService> {
  return Layer.succeed(LLMService, {
    callChatCompletion: (messages, config, tools) =>
      Effect.tryPromise({
        try: () => client.callChatCompletion(messages, config, tools),
        catch: (err) =>
          new ModelInvocationError({
            message: err instanceof Error ? err.message : String(err),
            cause: err,
          }),
      }),
  });
}

/**
 * Creates a live ToolService layer using a list of tools.
 */
export function createLiveToolLayer(tools: Tool[] = []): Layer.Layer<ToolService> {
  const registry = tools.length > 0 ? new ToolRegistry(tools) : null;

  return Layer.succeed(ToolService, {
    execute: (name, args) =>
      Effect.tryPromise({
        try: async () => {
          if (!registry) {
            return JSON.stringify(
              {
                toolStatus: "tool_error",
                outcome: "tool_error",
                error: {
                  type: "tool_invocation_error",
                  message: "No tools registered in agent session.",
                },
              },
              null,
              2
            );
          }
          return await registry.execute(name, args);
        },
        catch: (err) =>
          new ToolExecutionError({
            toolName: name,
            error: err instanceof Error ? err.message : String(err),
            cause: err,
          }),
      }),
    getTools: () => tools,
  });
}

/**
 * Combined live layer providing both LLMService and ToolService.
 */
export function createAgentLayer(options: {
  client?: OpenAICompatibleClient;
  tools?: Tool[];
} = {}): Layer.Layer<LLMService | ToolService> {
  return Layer.merge(
    createLiveLLMLayer(options.client),
    createLiveToolLayer(options.tools)
  );
}
