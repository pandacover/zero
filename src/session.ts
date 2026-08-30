import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getGlobalDefaultProvider, getZeroDir, loadProviderConfig, saveProviderConfig } from "./config.ts";
import { getProviderPreset } from "./providers.ts";
import { defaultTools } from "./tools.ts";
import type {
  Message,
  ProviderConfig,
  SessionSnapshot,
  Tool,
  TurnRecord,
  TurnStep,
} from "./types.ts";

export const DEFAULT_SYSTEM_PROMPT =
  "You have 7 callable tools: skill_discovery, bash, glob, grep, read, write, edit. " +
  "Skills (such as execute, codebase_discovery, debugging, validation_of_work, react, vite, typescript) " +
  "are knowledge guidelines that you read using skill_discovery({ skillName: '...' }), NOT tool calls. " +
  "Follow the execute workflow: understand task -> explore (use codebase_discovery guidelines) -> implement (use domain skills) -> validate (use validation_of_work via bash) -> debug if errors (use debugging guidelines) -> re-validate -> summarise. " +
  "If discovery tools execute successfully 3 times and return 0 files consistently 3 times, treat the codebase as conclusively empty and immediately proceed with the established natural next steps (e.g. project scaffolding via write, or asking the user if an existing codebase was expected).";

function getSessionsBaseDir(): string {
  return join(getZeroDir(), "sessions");
}

function ensureSessionsBaseDir(): void {
  const dir = getSessionsBaseDir();
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
  private turnsCount: number = 0;
  private activeTurn: TurnRecord | null = null;

  constructor(options?: {
    id?: string;
    provider?: ProviderConfig;
    systemPrompt?: string;
    tools?: Tool[];
    initialHistory?: Message[];
    turnsCount?: number;
    createdAt?: string;
    updatedAt?: string;
  }) {
    this.id =
      options?.id ??
      `session_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    this.createdAt = options?.createdAt ?? new Date().toISOString();
    this.updatedAt = options?.updatedAt ?? this.createdAt;
    this.provider = options?.provider ? { ...options.provider } : getGlobalDefaultProvider();
    this.systemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.tools = options?.tools ? [...options.tools] : [...defaultTools];
    this.history = options?.initialHistory ? [...options.initialHistory] : [];
    this.turnsCount = options?.turnsCount ?? 0;
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
   * Returns the directory for this session: ~/.zero/sessions/[id]/
   */
  getSessionDir(): string {
    return join(getSessionsBaseDir(), this.id);
  }

  /**
   * Returns path to main session file: ~/.zero/sessions/[id]/session.json
   */
  getSessionFilePath(): string {
    return join(this.getSessionDir(), "session.json");
  }

  /**
   * Returns path to a specific turn file: ~/.zero/sessions/[id]/[id]_turn_[turnIndex].json
   */
  getTurnFilePath(turnIndex: number): string {
    return join(this.getSessionDir(), `${this.id}_turn_${turnIndex}.json`);
  }

  /**
   * Ensures the session directory exists.
   */
  private ensureSessionDir(): void {
    ensureSessionsBaseDir();
    const dir = this.getSessionDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Saves overall session metadata to ~/.zero/sessions/[id]/session.json.
   * Note: API keys are NEVER written to session files.
   */
  save(): void {
    this.ensureSessionDir();
    this.updatedAt = new Date().toISOString();
    const filePath = this.getSessionFilePath();

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
      turnsCount: this.turnsCount,
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
   * Starts a new turn, initializes its turn file (~/.zero/sessions/[id]/[id]_turn_[turnIndex].json)
   * and saves the initial in-progress state.
   */
  startTurn(userPrompt: string): TurnRecord {
    this.ensureSessionDir();
    this.turnsCount++;

    const turn: TurnRecord = {
      turnIndex: this.turnsCount,
      sessionId: this.id,
      startedAt: new Date().toISOString(),
      userPrompt,
      status: "in_progress",
      steps: [],
    };

    this.activeTurn = turn;
    this.writeTurnFile(turn);
    this.save();

    return turn;
  }

  /**
   * Records a granular step (think, tool execution, response, error) into the active turn file in real time.
   */
  recordTurnStep(turnIndex: number, step: TurnStep): void {
    let turn = this.activeTurn && this.activeTurn.turnIndex === turnIndex ? this.activeTurn : this.getTurn(turnIndex);
    if (!turn) {
      turn = {
        turnIndex,
        sessionId: this.id,
        startedAt: new Date().toISOString(),
        userPrompt: "",
        status: "in_progress",
        steps: [],
      };
    }

    turn.steps.push(step);
    this.activeTurn = turn;
    this.writeTurnFile(turn);
  }

  /**
   * Finalizes a turn with its completion status, total duration, and optional error details.
   */
  completeTurn(
    turnIndex: number,
    result: {
      status: "success" | "error";
      finalResponse?: string;
      error?: { message: string; phase: string };
      totalDurationMs?: number;
    }
  ): void {
    let turn = this.activeTurn && this.activeTurn.turnIndex === turnIndex ? this.activeTurn : this.getTurn(turnIndex);
    if (!turn) {
      turn = {
        turnIndex,
        sessionId: this.id,
        startedAt: new Date().toISOString(),
        userPrompt: "",
        status: result.status,
        steps: [],
      };
    }

    turn.completedAt = new Date().toISOString();
    turn.status = result.status;
    turn.finalResponse = result.finalResponse;
    turn.error = result.error;
    turn.totalDurationMs = result.totalDurationMs;

    this.activeTurn = null;
    this.writeTurnFile(turn);
    this.save();
  }

  /**
   * Writes a turn record to ~/.zero/sessions/[id]/[id]_turn_[turnIndex].json.
   */
  private writeTurnFile(turn: TurnRecord): void {
    this.ensureSessionDir();
    const filePath = this.getTurnFilePath(turn.turnIndex);
    try {
      writeFileSync(filePath, JSON.stringify(turn, null, 2), "utf-8");
    } catch {
      // Ignore write errors in restricted environments
    }
  }

  /**
   * Reads a specific turn record by index.
   */
  getTurn(turnIndex: number): TurnRecord | null {
    const filePath = this.getTurnFilePath(turnIndex);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as TurnRecord;
    } catch {
      return null;
    }
  }

  /**
   * Returns all recorded turns for this session, sorted by turnIndex ascending.
   */
  getTurns(): TurnRecord[] {
    const dir = this.getSessionDir();
    if (!existsSync(dir)) {
      return [];
    }

    const turns: TurnRecord[] = [];
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (file.includes("_turn_") && file.endsWith(".json")) {
          const filePath = join(dir, file);
          try {
            const raw = readFileSync(filePath, "utf-8");
            const data = JSON.parse(raw) as TurnRecord;
            if (data && typeof data.turnIndex === "number") {
              turns.push(data);
            }
          } catch {
            // Ignore malformed turn file
          }
        }
      }
    } catch {
      return [];
    }

    return turns.sort((a, b) => a.turnIndex - b.turnIndex);
  }

  /**
   * Loads a saved session from ~/.zero/sessions/[id]/session.json (or legacy ~/.zero/sessions/[id].json).
   */
  static load(id: string): Session | null {
    const baseDir = getSessionsBaseDir();
    const directorySessionFile = join(baseDir, id, "session.json");
    const legacyFlatFile = join(baseDir, `${id}.json`);

    let targetFilePath = "";
    if (existsSync(directorySessionFile)) {
      targetFilePath = directorySessionFile;
    } else if (existsSync(legacyFlatFile)) {
      targetFilePath = legacyFlatFile;
    } else {
      return null;
    }

    try {
      const raw = readFileSync(targetFilePath, "utf-8");
      const data = JSON.parse(raw);

      // Always resolve decrypted API key directly from ~/.zero/[provider]_config.json
      const providerName = data.provider?.name || "Custom";
      const storedProvider = loadProviderConfig(providerName);
      const preset = getProviderPreset(providerName);

      const apiKey = storedProvider?.apiKey || (preset?.apiKeyEnvVar && process.env[preset.apiKeyEnvVar]) || "";

      const provider: ProviderConfig = {
        name: data.provider?.name || storedProvider?.name || preset?.name || "Custom",
        baseURL:
          data.provider?.baseURL ||
          storedProvider?.baseURL ||
          preset?.defaultBaseURL ||
          "http://localhost:8000/v1",
        apiKey,
        model: data.provider?.model || storedProvider?.model || preset?.defaultModels[0] || "default-model",
        defaultModels: data.provider?.defaultModels || storedProvider?.defaultModels || preset?.defaultModels || [],
        supportsReasoning:
          data.provider?.supportsReasoning ??
          storedProvider?.supportsReasoning ??
          preset?.supportsReasoning ??
          false,
      };

      const session = new Session({
        id: data.id,
        provider,
        systemPrompt: data.systemPrompt,
        initialHistory: data.history || [],
        turnsCount: data.turnsCount || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Lists all saved sessions from ~/.zero/sessions/ ordered by most recently updated first.
   */
  static listAll(): SessionSnapshot[] {
    const baseDir = getSessionsBaseDir();
    if (!existsSync(baseDir)) {
      return [];
    }

    const results: SessionSnapshot[] = [];
    try {
      const entries = readdirSync(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        let sessionFilePath = "";

        if (entry.isDirectory()) {
          const candidate = join(baseDir, entry.name, "session.json");
          if (existsSync(candidate)) {
            sessionFilePath = candidate;
          }
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
          sessionFilePath = join(baseDir, entry.name);
        }

        if (sessionFilePath) {
          try {
            const raw = readFileSync(sessionFilePath, "utf-8");
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
                turnsCount: data.turnsCount || 0,
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
   * Deletes a session directory (~/.zero/sessions/[id]/) or legacy file (~/.zero/sessions/[id].json).
   */
  static delete(id: string): boolean {
    const baseDir = getSessionsBaseDir();
    const sessionDir = join(baseDir, id);
    const legacyFile = join(baseDir, `${id}.json`);

    let deleted = false;
    if (existsSync(sessionDir)) {
      try {
        rmSync(sessionDir, { recursive: true, force: true });
        deleted = true;
      } catch {
        // Ignore
      }
    }

    if (existsSync(legacyFile)) {
      try {
        unlinkSync(legacyFile);
        deleted = true;
      } catch {
        // Ignore
      }
    }

    return deleted;
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

  getTurnsCount(): number {
    return this.turnsCount;
  }

  getSnapshot(): SessionSnapshot {
    return {
      id: this.id,
      provider: this.getProvider(),
      systemPrompt: this.systemPrompt,
      history: this.getHistory(),
      toolNames: this.tools.map((t) => t.name),
      turnsCount: this.turnsCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
