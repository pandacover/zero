import type { LLMResponse, Message, ProviderConfig, Tool } from "./types.ts";
import { ToolRegistry } from "./tools.ts";

export class OpenAICompatibleClient {
  /**
   * Calls the chat completion endpoint and extracts reasoning, tool calls, and final text.
   */
  async callChatCompletion(
    messages: Message[],
    config: ProviderConfig,
    tools?: Tool[]
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
        const errorJson = await response.json() as any;
        errorDetails = errorJson?.error?.message || JSON.stringify(errorJson);
      } catch {
        errorDetails = await response.text();
      }
      throw new Error(`API error from ${config.name} (${response.status}): ${errorDetails}`);
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
}
