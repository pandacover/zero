import type { Message, ProviderConfig, SessionSnapshot, Tool } from "./types.ts";
import { getGlobalDefaultProvider } from "./config.ts";
import { defaultTools } from "./tools.ts";

export const DEFAULT_SYSTEM_PROMPT =
  "use browse_skills for if you think the request requires any particular skill or tool";

export class Session {
  public readonly id: string;
  private history: Message[] = [];
  private provider: ProviderConfig;
  private systemPrompt: string;
  private tools: Tool[];

  constructor(options?: {
    id?: string;
    provider?: ProviderConfig;
    systemPrompt?: string;
    tools?: Tool[];
    initialHistory?: Message[];
  }) {
    this.id = options?.id ?? `session_${Math.random().toString(36).substring(2, 9)}`;
    // If specific provider is passed, use that; otherwise copy from global default
    this.provider = options?.provider ? { ...options.provider } : getGlobalDefaultProvider();
    this.systemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.tools = options?.tools ? [...options.tools] : [...defaultTools];
    this.history = options?.initialHistory ? [...options.initialHistory] : [];
  }

  /**
   * Factory method to create a fresh new session inheriting global default provider & model.
   */
  static createNew(options?: { id?: string; systemPrompt?: string; tools?: Tool[] }): Session {
    return new Session(options);
  }

  getHistory(): Message[] {
    return [...this.history];
  }

  addMessage(message: Message): void {
    this.history.push(message);
  }

  setHistory(history: Message[]): void {
    this.history = [...history];
  }

  clearHistory(): void {
    this.history = [];
  }

  getProvider(): ProviderConfig {
    return { ...this.provider };
  }

  setProvider(provider: ProviderConfig): void {
    this.provider = { ...provider };
  }

  setModel(model: string): void {
    this.provider.model = model;
  }

  setApiKey(apiKey: string): void {
    this.provider.apiKey = apiKey;
  }

  setBaseURL(baseURL: string): void {
    this.provider.baseURL = baseURL;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  getTools(): Tool[] {
    return [...this.tools];
  }

  setTools(tools: Tool[]): void {
    this.tools = [...tools];
  }

  getSnapshot(): SessionSnapshot {
    return {
      provider: this.getProvider(),
      systemPrompt: this.systemPrompt,
      history: this.getHistory(),
      toolNames: this.tools.map((t) => t.name),
    };
  }
}
