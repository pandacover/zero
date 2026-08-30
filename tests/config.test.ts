import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  getGlobalDefaultProvider,
  getProviderConfigFilePath,
  getZeroDir,
  loadProviderConfig,
  resetGlobalDefaults,
  saveProviderConfig,
  setGlobalDefaultProvider,
} from "../src/config.ts";
import { decrypt, encrypt } from "../src/crypto.ts";
import type { ProviderConfig } from "../src/types.ts";

const TEST_ZERO_DIR = resolve("./.test_sandbox/.zero");

describe("Encryption & Decryption", () => {
  it("encrypts and decrypts sensitive API keys cleanly with AES-256-GCM", () => {
    const rawKey = "sk-test-1234567890abcdef-secret-key";
    const encrypted = encrypt(rawKey);

    expect(encrypted).not.toBe(rawKey);
    expect(encrypted.split(":").length).toBe(3); // iv:tag:cipher

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(rawKey);
  });

  it("handles empty or falsy inputs gracefully", () => {
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });
});

describe("~/.zero Directory Configuration & Encrypted Storage", () => {
  const originalEnv = process.env.ZERO_CONFIG_DIR;

  beforeEach(() => {
    process.env.ZERO_CONFIG_DIR = TEST_ZERO_DIR;
    resetGlobalDefaults();
  });

  afterEach(() => {
    resetGlobalDefaults();
    if (originalEnv !== undefined) {
      process.env.ZERO_CONFIG_DIR = originalEnv;
    } else {
      delete process.env.ZERO_CONFIG_DIR;
    }
  });

  it("defaults to ~/.zero when ZERO_CONFIG_DIR is not set", () => {
    delete process.env.ZERO_CONFIG_DIR;
    expect(getZeroDir()).toBe(join(homedir(), ".zero"));
  });

  it("saves encrypted provider config to ~/.zero/[provider]_config.json and decrypts on load", () => {
    const provider: ProviderConfig = {
      name: "OpenAI",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-proj-supersecretkey999",
      model: "gpt-4o",
      defaultModels: ["gpt-4o", "gpt-4o-mini"],
      supportsReasoning: true,
    };

    // Save
    saveProviderConfig(provider);

    const configPath = getProviderConfigFilePath("openai");
    expect(existsSync(configPath)).toBe(true);

    // Verify file content on disk is actually encrypted
    const fileRaw = readFileSync(configPath, "utf-8");
    const json = JSON.parse(fileRaw);

    expect(json.providerId).toBe("openai");
    expect(json.model).toBe("gpt-4o");
    expect(json.encryptedApiKey).toBeDefined();
    expect(json.encryptedApiKey).not.toContain("sk-proj-supersecretkey999"); // Plaintext must NOT appear in file
    expect(json.encryptedApiKey.split(":").length).toBe(3); // Valid encrypted format

    // Load & Decrypt
    const loaded = loadProviderConfig("openai");
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("OpenAI");
    expect(loaded?.model).toBe("gpt-4o");
    expect(loaded?.apiKey).toBe("sk-proj-supersecretkey999"); // Decrypted accurately
  });

  it("loads multiple distinct provider configs accurately from ~/.zero directory", () => {
    const groq: ProviderConfig = {
      name: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: "gsk_groqkey123",
      model: "llama-3.3-70b-versatile",
      defaultModels: ["llama-3.3-70b-versatile"],
      supportsReasoning: true,
    };

    const deepseek: ProviderConfig = {
      name: "DeepSeek",
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "sk-deepseek456",
      model: "deepseek-reasoner",
      defaultModels: ["deepseek-reasoner"],
      supportsReasoning: true,
    };

    saveProviderConfig(groq);
    saveProviderConfig(deepseek);

    const groqLoaded = loadProviderConfig("groq");
    const deepseekLoaded = loadProviderConfig("deepseek");

    expect(groqLoaded?.apiKey).toBe("gsk_groqkey123");
    expect(groqLoaded?.model).toBe("llama-3.3-70b-versatile");

    expect(deepseekLoaded?.apiKey).toBe("sk-deepseek456");
    expect(deepseekLoaded?.model).toBe("deepseek-reasoner");
  });

  it("sets global default provider and restores it from ~/.zero directory", () => {
    const provider: ProviderConfig = {
      name: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: "gsk_defaultkey_777",
      model: "llama-3.3-70b-versatile",
      defaultModels: ["llama-3.3-70b-versatile"],
    };

    setGlobalDefaultProvider(provider, true);

    const globalDefault = getGlobalDefaultProvider();
    expect(globalDefault.name).toBe("Groq");
    expect(globalDefault.apiKey).toBe("gsk_defaultkey_777");
    expect(globalDefault.model).toBe("llama-3.3-70b-versatile");
  });

  it("preserves existing encrypted API key when updating model or other fields with empty apiKey", () => {
    const initial: ProviderConfig = {
      name: "OpenRouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-secretkey123",
      model: "anthropic/claude-3.5-sonnet",
      defaultModels: ["anthropic/claude-3.5-sonnet"],
    };

    saveProviderConfig(initial);

    // Update model only (apiKey is omitted / empty)
    const updateWithoutKey: ProviderConfig = {
      name: "OpenRouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "", // empty
      model: "deepseek/deepseek-r1",
      defaultModels: ["anthropic/claude-3.5-sonnet"],
    };

    saveProviderConfig(updateWithoutKey);

    const loaded = loadProviderConfig("openrouter");
    expect(loaded?.model).toBe("deepseek/deepseek-r1");
    expect(loaded?.apiKey).toBe("sk-or-v1-secretkey123"); // Key was preserved!
  });

  it("never saves API keys into session files and dynamically resolves them from provider config", () => {
    // 1. Save provider config with encrypted key
    const provider: ProviderConfig = {
      name: "OpenAI",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-openai-session-test-key",
      model: "gpt-4o",
      defaultModels: ["gpt-4o"],
    };
    saveProviderConfig(provider);

    // 2. Create session with this provider
    const { Session } = require("../src/session.ts");
    const session = Session.createNew({ provider });
    session.addMessage({ role: "user", content: "hello" });

    // 3. Inspect raw JSON file on disk
    const sessionFilePath = join(getZeroDir(), "sessions", session.id, "session.json");
    expect(existsSync(sessionFilePath)).toBe(true);

    const rawSessionJson = readFileSync(sessionFilePath, "utf-8");
    const parsed = JSON.parse(rawSessionJson);

    // Verify neither apiKey nor encryptedApiKey exists in the session file
    expect(parsed.provider.apiKey).toBeUndefined();
    expect(parsed.provider.encryptedApiKey).toBeUndefined();
    expect(rawSessionJson).not.toContain("sk-openai-session-test-key");

    // 4. Verify Session.load resolves the key dynamically from provider config
    const loadedSession = Session.load(session.id);
    expect(loadedSession).not.toBeNull();
    expect(loadedSession.getProvider().apiKey).toBe("sk-openai-session-test-key");

    // 5. Update provider key in provider config
    provider.apiKey = "sk-openai-updated-new-key";
    saveProviderConfig(provider);

    // Session automatically gets updated key without modifying session file
    expect(loadedSession.getProvider().apiKey).toBe("sk-openai-updated-new-key");
  });
});
