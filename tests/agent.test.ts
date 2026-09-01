import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Effect, Fiber, Layer, Stream } from "effect";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildWorkingHistory,
  createAgentLayer,
  createLiveLLMLayer,
  createLiveToolLayer,
  LLMService,
  ModelInvocationError,
  runAgent,
  ToolService,
} from "../src/agent.ts";
import { OpenAICompatibleClient } from "../src/client.ts";
import {
  getGlobalDefaultProvider,
  resetGlobalDefaults,
  setGlobalDefaultModel,
  setGlobalDefaultProvider,
} from "../src/config.ts";
import {
  createProviderConfig,
  getProviderPreset,
  PROVIDER_PRESETS,
} from "../src/providers.ts";
import { Session } from "../src/session.ts";
import { defaultTools } from "../src/tools.ts";
import type { AgentEvent, LLMResponse, Message, ProviderConfig, Tool } from "../src/types.ts";

const TEST_ZERO_DIR = resolve("./.test_sandbox/.zero");
process.env.ZERO_CONFIG_DIR = TEST_ZERO_DIR;

/**
 * Mock Client for deterministic testing of the Agent generator.
 */
class TestLLMClient extends OpenAICompatibleClient {
  private callQueue: LLMResponse[] = [];
  public receivedPayloads: Message[][] = [];

  enqueue(response: LLMResponse): this {
    this.callQueue.push(response);
    return this;
  }

  override async callChatCompletion(
    messages: Message[],
    _config: ProviderConfig,
    _tools?: Tool[]
  ): Promise<LLMResponse> {
    this.receivedPayloads.push([...messages]);
    const next = this.callQueue.shift();
    if (!next) {
      return { content: "Default fallback test response" };
    }
    return next;
  }
}

/**
 * Helper to collect all stream events using an Effect layer.
 */
async function collectAgentEvents(
  stream: Stream.Stream<AgentEvent, any, LLMService | ToolService>,
  options: { client?: OpenAICompatibleClient; tools?: Tool[] } = {}
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  const layer = createAgentLayer(options);
  const program = stream.pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        events.push(event);
      })
    ),
    Effect.provide(layer as Layer.Layer<LLMService | ToolService>)
  );

  await Effect.runPromise(program);
  return events;
}

describe("Agent Effect Stream & Event Processing", () => {
  const dummyConfig: ProviderConfig = {
    name: "TestProvider",
    baseURL: "http://localhost:11434/v1",
    apiKey: "test-key",
    model: "test-model",
    defaultModels: ["test-model"],
    supportsReasoning: false,
  };

  it("yields response:start -> response:complete -> done for direct response", async () => {
    const mockClient = new TestLLMClient();
    mockClient.enqueue({
      content: "Hello from test model!",
      usage: { total_tokens: 15 },
    });

    const stream = runAgent("Hello!", [], dummyConfig);
    const events = await collectAgentEvents(stream, {
      client: mockClient,
      tools: defaultTools,
    });

    expect(events.length).toBe(3);
    expect(events[0]?.type).toBe("response:start");
    expect(events[1]?.type).toBe("response:complete");
    if (events[1]?.type === "response:complete") {
      expect(events[1].content).toBe("Hello from test model!");
    }
    expect(events[2]?.type).toBe("done");
    if (events[2]?.type === "done") {
      expect(events[2].finalResponse).toBe("Hello from test model!");
      expect(events[2].history.length).toBe(2); // user + assistant
    }
  });

  it("handles reasoning / thinking and yields think:complete event", async () => {
    const mockClient = new TestLLMClient();
    mockClient.enqueue({
      content: "The answer is 42.",
      reasoning: "I should compute 6 times 7.",
    });

    const reasoningConfig: ProviderConfig = {
      ...dummyConfig,
      supportsReasoning: true,
    };

    const stream = runAgent("What is 6 * 7?", [], reasoningConfig);
    const events = await collectAgentEvents(stream, {
      client: mockClient,
    });

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("think:start");
    expect(eventTypes).toContain("think:complete");
    expect(eventTypes).toContain("response:complete");
    expect(eventTypes).toContain("done");

    const thinkEvent = events.find((e) => e.type === "think:complete") as any;
    expect(thinkEvent.thought).toBe("I should compute 6 times 7.");

    const doneEvent = events.find((e) => e.type === "done") as any;
    expect(doneEvent.history.length).toBe(2);
    expect(doneEvent.history[1].thought).toBe("I should compute 6 times 7.");
    expect(doneEvent.history[1].content).toBe("The answer is 42.");
  });

  it("executes tools in a multi-turn loop and emits tool:start and tool:complete events", async () => {
    const mockClient = new TestLLMClient();

    // Turn 1: Model requests a tool call to 'glob'
    mockClient.enqueue({
      content: null,
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "glob",
            arguments: JSON.stringify({ pattern: "package.json" }),
          },
        },
      ],
    });

    // Turn 2: Model returns final response after observing tool result
    mockClient.enqueue({
      content: "Found package.json file.",
    });

    const stream = runAgent("Find package.json", [], dummyConfig);
    const events = await collectAgentEvents(stream, {
      client: mockClient,
      tools: defaultTools,
    });

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("tool:start");
    expect(eventTypes).toContain("tool:complete");
    expect(eventTypes).toContain("response:complete");
    expect(eventTypes).toContain("done");

    const toolStart = events.find((e) => e.type === "tool:start") as any;
    expect(toolStart.toolName).toBe("glob");
    expect(toolStart.args).toEqual({ pattern: "package.json" });

    const toolComplete = events.find((e) => e.type === "tool:complete") as any;
    expect(toolComplete.toolName).toBe("glob");
    expect(toolComplete.result).toContain("package.json");

    // Check payload history passed to the model on turn 2
    expect(mockClient.receivedPayloads.length).toBe(2);
    const turn2Payload = mockClient.receivedPayloads[1]!;
    expect(turn2Payload.some((m) => m.role === "tool" && m.tool_call_id === "call_123")).toBe(true);
  });

  it("preserves and sends reasoning_content on assistant messages in multi-turn payloads", async () => {
    const mockClient = new TestLLMClient();

    // Turn 1: Model reasons and makes a tool call
    mockClient.enqueue({
      content: null,
      reasoning: "Let me check the files first before making changes.",
      tool_calls: [
        {
          id: "call_abc",
          type: "function",
          function: {
            name: "glob",
            arguments: JSON.stringify({ pattern: "*.ts" }),
          },
        },
      ],
    });

    // Turn 2: Model finishes
    mockClient.enqueue({
      content: "All TypeScript files checked.",
      reasoning: "Everything looks good.",
    });

    const stream = runAgent("Check ts files", [], dummyConfig);
    await collectAgentEvents(stream, {
      client: mockClient,
      tools: defaultTools,
    });

    expect(mockClient.receivedPayloads.length).toBe(2);
    const turn2Payload = mockClient.receivedPayloads[1]!;
    const assistantMsg = turn2Payload.find((m) => m.role === "assistant" && m.tool_calls);
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.thought).toBe("Let me check the files first before making changes.");
  });

  it("supports Fiber interruption to abort an agent run mid-flight", async () => {
    const mockClient = new TestLLMClient();
    // A deferred call that never completes
    mockClient.callChatCompletion = () => new Promise(() => {});

    const stream = runAgent("Hang query", [], dummyConfig);
    const layer = createAgentLayer({ client: mockClient });

    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        stream.pipe(
          Stream.runDrain,
          Effect.provide(layer)
        )
      );

      // Interrupt fiber immediately
      yield* Fiber.interrupt(fiber);
    });

    // Interruption finishes cleanly without hanging
    await Effect.runPromise(program);
  });

  it("streams events incrementally in real time during multi-turn execution", async () => {
    const timestamps: Array<{ type: string; elapsedMs: number }> = [];
    const mockClient = new TestLLMClient();

    // Turn 1: returns tool call
    mockClient.enqueue({
      content: null,
      tool_calls: [
        {
          id: "call_slow",
          type: "function",
          function: { name: "slow_tool", arguments: "{}" },
        },
      ],
    });

    // Turn 2: returns response
    mockClient.enqueue({
      content: "All done!",
    });

    // A tool that simulates a 60ms delay
    const slowTool = {
      name: "slow_tool",
      description: "A slow test tool",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        await new Promise((r) => setTimeout(r, 60));
        return JSON.stringify({ outcome: "success" });
      },
    };

    const stream = runAgent("run slow tool", [], dummyConfig);
    const layer = createAgentLayer({ client: mockClient, tools: [slowTool as any] });

    const start = Date.now();
    await Effect.runPromise(
      stream.pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            timestamps.push({ type: event.type, elapsedMs: Date.now() - start });
          })
        ),
        Effect.provide(layer)
      )
    );

    const toolStart = timestamps.find((t) => t.type === "tool:start");
    const toolComplete = timestamps.find((t) => t.type === "tool:complete");
    expect(toolStart).toBeDefined();
    expect(toolComplete).toBeDefined();
    // tool:complete must arrive at least 40ms after tool:start, proving events stream live
    expect(toolComplete!.elapsedMs - toolStart!.elapsedMs).toBeGreaterThanOrEqual(40);
  });

  it("emits think:complete and response:start sequentially during streaming before response:complete", async () => {
    const timestamps: Array<{ type: string; elapsedMs: number }> = [];

    const mockStreamingClient: OpenAICompatibleClient = {
      callChatCompletion: async (_messages: any, _config: any, _tools?: any, callbacks?: any) => {
        // 1. Simulate reasoning phase
        await new Promise((r) => setTimeout(r, 20));
        callbacks?.onReasoningComplete?.("I am pondering the problem.");
        callbacks?.onResponseStart?.();

        // 2. Simulate response generation phase
        await new Promise((r) => setTimeout(r, 50));
        return {
          content: "Here is the final answer.",
          reasoning: "I am pondering the problem.",
        };
      },
    } as any;

    const reasoningConfig: ProviderConfig = {
      ...dummyConfig,
      supportsReasoning: true,
    };

    const stream = runAgent("test query", [], reasoningConfig);
    const layer = createAgentLayer({ client: mockStreamingClient });

    const start = Date.now();
    await Effect.runPromise(
      stream.pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            timestamps.push({ type: event.type, elapsedMs: Date.now() - start });
          })
        ),
        Effect.provide(layer)
      )
    );

    const thinkStart = timestamps.find((t) => t.type === "think:start");
    const thinkComplete = timestamps.find((t) => t.type === "think:complete");
    const responseStart = timestamps.find((t) => t.type === "response:start");
    const responseComplete = timestamps.find((t) => t.type === "response:complete");

    expect(thinkStart).toBeDefined();
    expect(thinkComplete).toBeDefined();
    expect(responseStart).toBeDefined();
    expect(responseComplete).toBeDefined();

    // Verification: think:complete must arrive BEFORE response:complete with a clear time gap
    expect(responseComplete!.elapsedMs - thinkComplete!.elapsedMs).toBeGreaterThanOrEqual(40);
    // response:start must be emitted when reasoning completes
    expect(responseStart!.elapsedMs).toBeGreaterThanOrEqual(thinkComplete!.elapsedMs);
  });
});

describe("History Normalization (buildWorkingHistory)", () => {
  it("filters leading duplicate system prompts and prepends configured prompt", () => {
    const prior: Message[] = [
      { role: "system", content: "Old system prompt" },
      { role: "user", content: "Previous question" },
      { role: "assistant", content: "Previous answer" },
    ];

    const result = buildWorkingHistory("New question", prior, "New active prompt");
    expect(result[0]).toEqual({ role: "system", content: "New active prompt" });
    expect(result[1]).toEqual({ role: "user", content: "Previous question" });
    expect(result[2]).toEqual({ role: "assistant", content: "Previous answer" });
    expect(result[3]).toEqual({ role: "user", content: "New question" });
  });

  it("deduplicates consecutive duplicate user prompts", () => {
    const prior: Message[] = [
      { role: "user", content: "Identical query" },
    ];

    const result = buildWorkingHistory("Identical query", prior);
    expect(result.length).toBe(1);
    expect(result[0]?.content).toBe("Identical query");
  });
});

describe("Session Management & Detachment", () => {
  it("keeps session history decoupled from agent generator", async () => {
    const session = new Session({
      systemPrompt: "You are a test assistant.",
    });

    expect(session.getHistory().length).toBe(0);

    const mockClient = new TestLLMClient();
    mockClient.enqueue({ content: "First answer" });

    const stream = runAgent("Query 1", session.getHistory(), session.getProvider(), {
      systemPrompt: session.getSystemPrompt(),
    });

    const events = await collectAgentEvents(stream, { client: mockClient });
    const doneEvent = events.find((e) => e.type === "done") as any;

    // Session history should remain untouched until caller decides to update it
    expect(session.getHistory().length).toBe(0);

    // Explicit session update
    session.setHistory(doneEvent.history);
    expect(session.getHistory().length).toBe(3); // system + user + assistant

    // Clear history
    session.clearHistory();
    expect(session.getHistory().length).toBe(0);
  });

  it("updates provider, model, and API key in session", () => {
    const session = new Session();
    const groqPreset = getProviderPreset("groq")!;
    const groqConfig = createProviderConfig(groqPreset, {
      apiKey: "gsk_12345",
      model: "llama-3.3-70b-versatile",
    });

    session.setProvider(groqConfig);
    expect(session.getProvider().name).toBe("Groq");
    expect(session.getProvider().apiKey).toBe("gsk_12345");
    expect(session.getProvider().model).toBe("llama-3.3-70b-versatile");

    session.setModel("mixtral-8x7b-32768");
    expect(session.getProvider().model).toBe("mixtral-8x7b-32768");
  });
});

describe("Global Default Provider & Model across Sessions", () => {
  it("allows setting global default provider/model and new sessions inherit it while existing sessions retain theirs", () => {
    // 1. Set global default to Groq / llama-3.3-70b-versatile
    const groqPreset = getProviderPreset("groq")!;
    const initialDefault = createProviderConfig(groqPreset, {
      apiKey: "gsk_test",
      model: "llama-3.3-70b-versatile",
    });
    setGlobalDefaultProvider(initialDefault, false);

    // 2. Create Session 1 -> inherits initial default
    const session1 = new Session();
    expect(session1.getProvider().name).toBe("Groq");
    expect(session1.getProvider().model).toBe("llama-3.3-70b-versatile");

    // 3. User explicitly customizes Session 1 to DeepSeek / deepseek-reasoner
    const deepseekPreset = getProviderPreset("deepseek")!;
    const deepseekConfig = createProviderConfig(deepseekPreset, {
      apiKey: "sk-deepseek",
      model: "deepseek-reasoner",
    });
    session1.setProvider(deepseekConfig);
    expect(session1.getProvider().name).toBe("DeepSeek");
    expect(session1.getProvider().model).toBe("deepseek-reasoner");

    // 4. Update the global default to OpenAI / gpt-4o
    const openaiPreset = getProviderPreset("openai")!;
    const newDefault = createProviderConfig(openaiPreset, {
      apiKey: "sk-openai",
      model: "gpt-4o",
    });
    setGlobalDefaultProvider(newDefault, false);

    // 5. Verify Session 1 STILL retains its selected DeepSeek model
    expect(session1.getProvider().name).toBe("DeepSeek");
    expect(session1.getProvider().model).toBe("deepseek-reasoner");

    // 6. Create Session 2 -> automatically inherits the new global default (OpenAI / gpt-4o)
    const session2 = Session.createNew();
    expect(session2.getProvider().name).toBe("OpenAI");
    expect(session2.getProvider().model).toBe("gpt-4o");

    // 7. Update global default model only to gpt-4o-mini
    setGlobalDefaultModel("gpt-4o-mini", false);

    // Session 1 & 2 retain their models
    expect(session1.getProvider().model).toBe("deepseek-reasoner");
    expect(session2.getProvider().model).toBe("gpt-4o");

    // Session 3 inherits gpt-4o-mini
    const session3 = new Session();
    expect(session3.getProvider().name).toBe("OpenAI");
    expect(session3.getProvider().model).toBe("gpt-4o-mini");
  });

  it("persists sessions to disk and lists them via Session.listAll", () => {
    // 1. Create and save session A
    const sessA = Session.createNew();
    sessA.setModel("gpt-4o");
    sessA.addMessage({ role: "user", content: "Hello A" });
    sessA.addMessage({ role: "assistant", content: "Hi A" });

    // 2. Create and save session B
    const sessB = Session.createNew();
    sessB.setModel("claude-3.5-sonnet");
    sessB.addMessage({ role: "user", content: "Hello B" });

    // 3. List all saved sessions
    const all = Session.listAll();
    const ids = all.map((s) => s.id);
    expect(ids).toContain(sessA.id);
    expect(ids).toContain(sessB.id);

    const snapA = all.find((s) => s.id === sessA.id);
    expect(snapA?.history.length).toBe(2);
    expect(snapA?.provider.model).toBe("gpt-4o");

    const snapB = all.find((s) => s.id === sessB.id);
    expect(snapB?.history.length).toBe(1);

    // 4. Load session from disk
    const loadedA = Session.load(sessA.id);
    expect(loadedA).not.toBeNull();
    expect(loadedA?.getHistory().length).toBe(2);
    expect(loadedA?.getProvider().model).toBe("gpt-4o");

    // 5. Delete session
    const deleted = Session.delete(sessA.id);
    expect(deleted).toBe(true);
    expect(Session.load(sessA.id)).toBeNull();
  });

  it("stores hierarchical sessions with session.json and [id]_turn_[index].json including thinking and failure steps", () => {
    const session = Session.createNew();

    // 1. Start turn 1
    const turn1 = session.startTurn("List all project files and analyze them");
    expect(turn1.turnIndex).toBe(1);
    expect(turn1.status).toBe("in_progress");

    // Verify turn file exists: ~/.zero/sessions/[id]/[id]_turn_1.json
    const turn1Path = session.getTurnFilePath(1);
    expect(existsSync(turn1Path)).toBe(true);

    // Verify session.json exists: ~/.zero/sessions/[id]/session.json
    const sessionJsonPath = session.getSessionFilePath();
    expect(existsSync(sessionJsonPath)).toBe(true);

    // 2. Record think step
    session.recordTurnStep(1, {
      type: "think",
      thought: "I should glob for files first.",
      durationMs: 450,
    });

    // 3. Record tool step
    session.recordTurnStep(1, {
      type: "tool",
      toolName: "glob",
      args: { pattern: "*.ts" },
      callId: "call_glob_1",
      result: "src/index.ts, src/agent.ts",
      durationMs: 120,
      toolStatus: "success",
      outcome: "success",
    });

    // 4. Record response step
    session.recordTurnStep(1, {
      type: "response",
      content: "Found 2 files: src/index.ts, src/agent.ts.",
      durationMs: 300,
    });

    // 5. Complete turn 1 with success
    session.completeTurn(1, {
      status: "success",
      finalResponse: "Found 2 files: src/index.ts, src/agent.ts.",
      totalDurationMs: 870,
    });

    // Verify turn 1 content on disk
    const loadedTurn1 = session.getTurn(1);
    expect(loadedTurn1).not.toBeNull();
    expect(loadedTurn1?.status).toBe("success");
    expect(loadedTurn1?.steps.length).toBe(3);
    expect(loadedTurn1?.steps[0]?.type).toBe("think");
    expect(loadedTurn1?.steps[1]?.type).toBe("tool");
    expect(loadedTurn1?.steps[2]?.type).toBe("response");
    expect(loadedTurn1?.finalResponse).toBe("Found 2 files: src/index.ts, src/agent.ts.");

    // 6. Start turn 2 (which will fail midway)
    const turn2 = session.startTurn("Perform an invalid operation");
    expect(turn2.turnIndex).toBe(2);

    session.recordTurnStep(2, {
      type: "think",
      thought: "Attempting to execute requested action...",
      durationMs: 200,
    });

    // Record failure step
    session.recordTurnStep(2, {
      type: "error",
      message: "API rate limit exceeded (429)",
      phase: "model",
    });

    session.completeTurn(2, {
      status: "error",
      error: { message: "API rate limit exceeded (429)", phase: "model" },
      totalDurationMs: 350,
    });

    // Verify turn 2 records the failure and steps on disk
    const loadedTurn2 = session.getTurn(2);
    expect(loadedTurn2).not.toBeNull();
    expect(loadedTurn2?.status).toBe("error");
    expect(loadedTurn2?.error?.message).toBe("API rate limit exceeded (429)");
    expect(loadedTurn2?.steps.length).toBe(2);
    expect(loadedTurn2?.steps[1]?.type).toBe("error");

    // Verify getTurns returns both turns
    const allTurns = session.getTurns();
    expect(allTurns.length).toBe(2);
    expect(allTurns[0]?.turnIndex).toBe(1);
    expect(allTurns[1]?.turnIndex).toBe(2);

    // Clean up
    Session.delete(session.id);
  });
});

describe("Provider Presets", () => {
  it("defines presets for all standard providers", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("groq");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("deepseek");
    expect(ids).toContain("ollama");
    expect(ids).toContain("lmstudio");
    expect(ids).toContain("custom");
  });
});
