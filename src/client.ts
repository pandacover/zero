import type { LLMResponse, LLMStreamCallbacks, Message, ProviderConfig, Tool, ToolCall, TokenUsage } from "./types.ts";
import { ToolRegistry } from "./tools.ts";

export class OpenAICompatibleClient {
  /**
   * Calls the chat completion endpoint and extracts reasoning, tool calls, and final text.
   * Supports streaming SSE to trigger callbacks for thinking completion and response start in real time.
   */
  async callChatCompletion(
    messages: Message[],
    config: ProviderConfig,
    tools?: Tool[],
    callbacks?: LLMStreamCallbacks
  ): Promise<LLMResponse> {
    const url = `${config.baseURL.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.apiKey && config.apiKey !== "not-needed") {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const toolRegistry = tools && tools.length > 0 ? new ToolRegistry(tools) : null;
    const openAITools = toolRegistry ? toolRegistry.toOpenAITools() : undefined;

    // Sanitize messages for OpenAI API specifications
    const formattedMessages = messages.map((m) => {
      const msg: Record<string, any> = {
        role: m.role,
        content: m.content ?? "",
      };
      if (m.thought) {
        msg.reasoning_content = m.thought;
      }
      if (m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }
      if (m.name) {
        msg.name = m.name;
      }
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls;
      }
      return msg;
    });

    const body: Record<string, any> = {
      model: config.model,
      messages: formattedMessages,
      stream: Boolean(callbacks),
    };

    if (openAITools && openAITools.length > 0) {
      body.tools = openAITools;
      body.tool_choice = "auto";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new Error(`Failed to connect to ${config.name} at ${url}: ${err.message || String(err)}`);
    }

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorJson = (await response.json()) as any;
        errorDetails = errorJson?.error?.message || JSON.stringify(errorJson);
      } catch {
        errorDetails = await response.text();
      }
      throw new Error(`API error from ${config.name} (${response.status}): ${errorDetails}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (callbacks && contentType.includes("text/event-stream") && response.body) {
      return this.handleStreamResponse(response.body, callbacks);
    }

    const data = (await response.json()) as any;
    const choice = data?.choices?.[0];

    if (!choice) {
      throw new Error(`No choices returned from ${config.name} response.`);
    }

    const message = choice.message || {};
    let content: string | null = message.content ?? null;
    let reasoning: string | null =
      message.reasoning_content ?? message.reasoning ?? message.thought ?? null;

    // If reasoning wasn't in reasoning fields, check for <think>...</think> tags in content
    if (!reasoning && content && content.includes("<think>")) {
      const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch && thinkMatch[1]) {
        reasoning = thinkMatch[1].trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
      }
    }

    const toolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0
      ? message.tool_calls
      : undefined;

    return {
      content,
      reasoning,
      tool_calls: toolCalls,
      usage: data.usage,
    };
  }

  /**
   * Consumes an SSE stream chunk by chunk, emitting live callbacks when reasoning completes
   * and response text begins.
   */
  private async handleStreamResponse(
    bodyStream: ReadableStream<Uint8Array>,
    callbacks: LLMStreamCallbacks
  ): Promise<LLMResponse> {
    const reader = bodyStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    const toolCallsByIndex: Record<number, ToolCall> = {};
    let insideThinkTag = false;
    let reasoningFinished = false;
    let usage: TokenUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") break;
          try {
            const json = JSON.parse(dataStr);
            if (json.usage) {
              usage = json.usage;
            }
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;

            // 1. Accumulate reasoning content if present
            const reasoningDelta = delta.reasoning_content ?? delta.reasoning ?? delta.thought ?? "";
            if (reasoningDelta) {
              reasoning += reasoningDelta;
            }

            // 2. Accumulate message content (handling inline <think> tags)
            const contentDelta = delta.content ?? "";
            if (contentDelta) {
              if (contentDelta.includes("<think>")) {
                insideThinkTag = true;
                const parts = contentDelta.split("<think>");
                if (parts[0]) content += parts[0];
                if (parts[1]) reasoning += parts[1];
              } else if (insideThinkTag) {
                if (contentDelta.includes("</think>")) {
                  insideThinkTag = false;
                  const parts = contentDelta.split("</think>");
                  if (parts[0]) reasoning += parts[0];
                  if (parts[1]) content += parts[1];
                } else {
                  reasoning += contentDelta;
                }
              } else {
                content += contentDelta;
              }
            }

            // 3. Accumulate streamed tool calls
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsByIndex[idx]) {
                  toolCallsByIndex[idx] = {
                    id: tc.id || `call_${idx}`,
                    type: "function",
                    function: {
                      name: tc.function?.name || "",
                      arguments: tc.function?.arguments || "",
                    },
                  };
                } else {
                  if (tc.id) toolCallsByIndex[idx]!.id = tc.id;
                  if (tc.function?.name) toolCallsByIndex[idx]!.function.name += tc.function.name;
                  if (tc.function?.arguments) toolCallsByIndex[idx]!.function.arguments += tc.function.arguments;
                }
              }
            }

            // 4. Transition Check: Has reasoning finished and content/tools begun?
            if (!reasoningFinished && !insideThinkTag && reasoning.trim().length > 0) {
              const hasStartedContent = content.length > 0;
              const hasStartedTools = Object.keys(toolCallsByIndex).length > 0;
              if (hasStartedContent || hasStartedTools) {
                reasoningFinished = true;
                callbacks.onReasoningComplete?.(reasoning.trim());
                if (hasStartedContent && !hasStartedTools) {
                  callbacks.onResponseStart?.();
                }
              }
            }
          } catch {
            // Ignore parse errors on individual stream chunks
          }
        }
      }
    }

    if (!reasoningFinished && reasoning.trim().length > 0) {
      reasoningFinished = true;
      callbacks.onReasoningComplete?.(reasoning.trim());
    }

    const toolCalls = Object.values(toolCallsByIndex);
    return {
      content: content || null,
      reasoning: reasoning.trim() || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }
}
