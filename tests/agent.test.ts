import { describe, expect, it } from "bun:test";
import { Agent } from "../src/agent.ts";
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

describe("Agent Generator & Event Streaming", () => {
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

    const events: AgentEvent[] = [];
    const generator = Agent.run("Hello!", [], dummyConfig, {
      client: mockClient,
      tools: defaultTools,
    });

    for await (const event of generator) {
      events.push(event);
    }

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

    const events: AgentEvent[] = [];
    const generator = Agent.run("What is 6 * 7?", [], reasoningConfig, {
      client: mockClient,
    });

    for await (const event of generator) {
      events.push(event);
    }

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("think:start");
    expect(eventTypes).toContain("think:complete");
    expect(eventTypes).toContain("response:complete");
    expect(eventTypes).toContain("done");

    const thinkEvent = events.find((e) => e.type === "think:complete") as any;
    expect(thinkEvent.thought).toBe("I should compute 6 times 7.");
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

    const events: AgentEvent[] = [];
    const generator = Agent.run("Find package.json", [], dummyConfig, {
      client: mockClient,
      tools: defaultTools,
    });

    for await (const event of generator) {
      events.push(event);
    }

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
});

describe("Session Management & Detachment", () => {
  it("keeps session history decoupled from agent generator", async () => {
    const session = new Session({
      systemPrompt: "You are a test assistant.",
    });

    expect(session.getHistory().length).toBe(0);

    const mockClient = new TestLLMClient();
    mockClient.enqueue({ content: "First answer" });

    const generator = Agent.run("Query 1", session.getHistory(), session.getProvider(), {
      client: mockClient,
      systemPrompt: session.getSystemPrompt(),
    });

    let doneEvent: any = null;
    for await (const event of generator) {
      if (event.type === "done") {
        doneEvent = event;
      }
    }

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
