/**
 * Core type definitions for the Zero Agent Loop.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string of arguments
  };
}

export interface Message {
  role: Role;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, any>) => Promise<string> | string;
}

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  defaultModels: string[];
  supportsReasoning?: boolean;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LLMResponse {
  content: string | null;
  reasoning?: string | null;
  tool_calls?: ToolCall[];
  usage?: TokenUsage;
}

export type AgentEvent =
  | { type: "think:start" }
  | { type: "think:complete"; thought: string; durationMs: number }
  | { type: "tool:start"; toolName: string; args: Record<string, any>; callId: string }
  | { type: "tool:complete"; toolName: string; args: Record<string, any>; result: string; durationMs: number; callId: string }
  | { type: "response:start" }
  | { type: "response:complete"; content: string; durationMs: number; usage?: TokenUsage }
  | { type: "error"; message: string; phase: "think" | "tool" | "response" | "model" }
  | { type: "done"; finalResponse: string; history: Message[]; totalDurationMs: number };

export interface AgentResult {
  finalResponse: string;
  history: Message[];
  totalDurationMs: number;
  steps: number;
}

export interface SessionSnapshot {
  provider: ProviderConfig;
  systemPrompt: string;
  history: Message[];
  toolNames: string[];
}
