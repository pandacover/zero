import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getGlobalDefaultProvider, getZeroDir, loadProviderConfig, saveProviderConfig } from "./config.ts";
import { getProviderPreset } from "./providers.ts";
import { defaultTools } from "./tools.ts";
import type { Message, ProviderConfig, SessionSnapshot, Tool } from "./types.ts";

export const DEFAULT_SYSTEM_PROMPT =
  "use browse_skills for if you think the request requires any particular skill or tool";

function getSessionsDir(): string {
  return join(getZeroDir(), "sessions");
}

function ensureSessionsDir(): void {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class Session {
  public readonly id: string;
  public readonly createdAt: string;
  public updatedAt: string;
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
    createdAt?: string;
    updatedAt?: string;
  }) {
    this.id = options?.id ?? `session_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    this.createdAt = options?.createdAt ?? new Date().toISOString();
    this.updatedAt = options?.updatedAt ?? this.createdAt;
    // If specific provider is passed, use that; otherwise copy from global default
    this.provider = options?.provider ? { ...options.provider } : getGlobalDefaultProvider();
    this.systemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.tools = options?.tools ? [...options.tools] : [...defaultTools];
    this.history = options?.initialHistory ? [...options.initialHistory] : [];
  }

  /**
   * Factory method to create a fresh new session inheriting global default provider & model and saving it.
   */
  static createNew(options?: { id?: string; systemPrompt?: string; tools?: Tool[] }): Session {
    const session = new Session(options);
    session.save();
    return session;
  }

  /**
   * Saves the session to ~/.zero/sessions/[id].json.
   * Note: API keys (encrypted or not) are NEVER written to session files.
   */
  save(): void {
    ensureSessionsDir();
    this.updatedAt = new Date().toISOString();
    const filePath = join(getSessionsDir(), `${this.id}.json`);

    const data = {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      provider: {
        name: this.provider.name,
        baseURL: this.provider.baseURL,
        model: this.provider.model,
        defaultModels: this.provider.defaultModels,
        supportsReasoning: this.provider.supportsReasoning,
      },
      systemPrompt: this.systemPrompt,
      history: this.history,
      toolNames: this.tools.map((t) => t.name),
    };

    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Ignore write errors in restricted environments
    }
  }

  /**
   * Loads a saved session from ~/.zero/sessions/[id].json and always resolves
   * the API key on demand from ~/.zero/[provider]_config.json.
   */
  static load(id: string): Session | null {
    const filePath = join(getSessionsDir(), `${id}.json`);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);

      // Always resolve decrypted API key directly from ~/.zero/[provider]_config.json
      const providerName = data.provider?.name || "Custom";
      const storedProvider = loadProviderConfig(providerName);
      const preset = getProviderPreset(providerName);

      const apiKey = storedProvider?.apiKey || (preset?.apiKeyEnvVar && process.env[preset.apiKeyEnvVar]) || "";

      const provider: ProviderConfig = {
        name: data.provider?.name || storedProvider?.name || preset?.name || "Custom",
        baseURL: data.provider?.baseURL || storedProvider?.baseURL || preset?.defaultBaseURL || "http://localhost:8000/v1",
        apiKey,
        model: data.provider?.model || storedProvider?.model || preset?.defaultModels[0] || "default-model",
        defaultModels: data.provider?.defaultModels || storedProvider?.defaultModels || preset?.defaultModels || [],
        supportsReasoning: data.provider?.supportsReasoning ?? storedProvider?.supportsReasoning ?? preset?.supportsReasoning ?? false,
      };

      return new Session({
        id: data.id,
        provider,
        systemPrompt: data.systemPrompt,
        initialHistory: data.history || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    } catch {
      return null;
    }
  }

  /**
   * Lists all saved sessions from ~/.zero/sessions/ ordered by most recently updated first.
   */
  static listAll(): SessionSnapshot[] {
    const dir = getSessionsDir();
    if (!existsSync(dir)) {
      return [];
    }

    const results: SessionSnapshot[] = [];
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const filePath = join(dir, file);
          try {
            const raw = readFileSync(filePath, "utf-8");
            const data = JSON.parse(raw);
            if (data.id) {
              results.push({
                id: data.id,
                provider: {
                  name: data.provider?.name || "Custom",
                  baseURL: data.provider?.baseURL || "http://localhost:8000/v1",
                  apiKey: "", // Never expose API keys in snapshot listings
                  model: data.provider?.model || "default-model",
                  defaultModels: data.provider?.defaultModels || [],
                  supportsReasoning: data.provider?.supportsReasoning,
                },
                systemPrompt: data.systemPrompt,
                history: data.history || [],
                toolNames: data.toolNames || [],
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
              });
            }
          } catch {
            // Ignore corrupted session file
          }
        }
      }
    } catch {
      return [];
    }

    // Sort descending by updatedAt
    return results.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  /**
   * Deletes a session file from ~/.zero/sessions/[id].json.
   */
  static delete(id: string): boolean {
    const filePath = join(getSessionsDir(), `${id}.json`);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  getHistory(): Message[] {
    return [...this.history];
  }

  addMessage(message: Message): void {
    this.history.push(message);
    this.save();
  }

  setHistory(history: Message[]): void {
    this.history = [...history];
    this.save();
  }

  clearHistory(): void {
    this.history = [];
    this.save();
  }

  getProvider(): ProviderConfig {
    // Always resolve the decrypted API key and base URL directly from ~/.zero/[provider]_config.json
    const stored = loadProviderConfig(this.provider.name);
    const preset = getProviderPreset(this.provider.name);
    const apiKey =
      stored?.apiKey ||
      (preset?.apiKeyEnvVar && process.env[preset.apiKeyEnvVar]) ||
      this.provider.apiKey ||
      "";

    return {
      ...this.provider,
      baseURL: stored?.baseURL || this.provider.baseURL,
      apiKey,
    };
  }

  setProvider(provider: ProviderConfig): void {
    this.provider = { ...provider };
    if (provider.apiKey) {
      saveProviderConfig(provider);
    }
    this.save();
  }

  setModel(model: string): void {
    this.provider.model = model;
    this.save();
  }

  setApiKey(apiKey: string): void {
    this.provider.apiKey = apiKey;
    saveProviderConfig(this.provider);
    this.save();
  }

  setBaseURL(baseURL: string): void {
    this.provider.baseURL = baseURL;
    saveProviderConfig(this.provider);
    this.save();
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    this.save();
  }

  getTools(): Tool[] {
    return [...this.tools];
  }

  setTools(tools: Tool[]): void {
    this.tools = [...tools];
  }

  getSnapshot(): SessionSnapshot {
    return {
      id: this.id,
      provider: this.getProvider(),
      systemPrompt: this.systemPrompt,
      history: this.getHistory(),
      toolNames: this.tools.map((t) => t.name),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
