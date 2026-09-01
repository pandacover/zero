import { Data } from "effect";

/**
 * Tagged error representing a failure during an LLM chat completion request.
 */
export class ModelInvocationError extends Data.TaggedError("ModelInvocationError")<{
  readonly message: string;
  readonly phase?: "model";
  readonly cause?: unknown;
}> {}

/**
 * Tagged error representing a failure when executing a tool.
 */
export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
  readonly toolName: string;
  readonly error: string;
  readonly callId?: string;
  readonly cause?: unknown;
}> {}

/**
 * Tagged error representing that the agent loop exceeded the configured maximum steps limit.
 */
export class MaxStepsExceededError extends Data.TaggedError("MaxStepsExceededError")<{
  readonly maxSteps: number;
}> {}

/**
 * Union of all typed errors emitted by the agent runtime.
 */
export type AgentError =
  | ModelInvocationError
  | ToolExecutionError
  | MaxStepsExceededError;
