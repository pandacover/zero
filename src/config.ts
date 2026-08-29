import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decrypt, encrypt } from "./crypto.ts";
import { getDefaultProvider, getProviderPreset, PROVIDER_PRESETS } from "./providers.ts";
import type { ProviderConfig } from "./types.ts";

export interface StoredProviderFile {
  providerId: string;
  name: string;
  baseURL: string;
  model: string;
  encryptedApiKey: string;
  supportsReasoning?: boolean;
  updatedAt: string;
}

const ZERO_DIR = resolve(".zero");

/**
 * Normalizes provider name or ID into a clean lowercase filename prefix (e.g. "openai", "groq", "ollama").
 */
export function normalizeProviderId(nameOrId: string): string {
  const clean = nameOrId
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "") // Remove (Local) etc.
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Match against preset IDs if possible
  const preset = getProviderPreset(clean) || getProviderPreset(nameOrId);
  return preset ? preset.id : clean || "custom";
}

/**
 * Gets path to the provider config file: ./.zero/[provider]_config.json
 */
export function getProviderConfigFilePath(providerNameOrId: string): string {
  const id = normalizeProviderId(providerNameOrId);
  return join(ZERO_DIR, `${id}_config.json`);
}

/**
 * Ensures the ./.zero directory exists.
 */
function ensureZeroDir(): void {
  if (!existsSync(ZERO_DIR)) {
    mkdirSync(ZERO_DIR, { recursive: true });
  }
}

/**
 * Saves a provider configuration to ./.zero/[provider]_config.json with encrypted API key.
 */
export function saveProviderConfig(provider: ProviderConfig): void {
  ensureZeroDir();
  const id = normalizeProviderId(provider.name);
  const filePath = getProviderConfigFilePath(id);

  const encryptedKey = provider.apiKey ? encrypt(provider.apiKey) : "";

  const data: StoredProviderFile = {
    providerId: id,
    name: provider.name,
    baseURL: provider.baseURL,
    model: provider.model,
    encryptedApiKey: encryptedKey,
    supportsReasoning: provider.supportsReasoning,
    updatedAt: new Date().toISOString(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err: any) {
    console.error(`Warning: Failed to save provider config to ${filePath}:`, err.message);
  }
}

/**
 * Loads a provider configuration from ./.zero/[provider]_config.json and decrypts the API key.
 */
export function loadProviderConfig(providerNameOrId: string): ProviderConfig | null {
  const filePath = getProviderConfigFilePath(providerNameOrId);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as StoredProviderFile;
    const decryptedKey = data.encryptedApiKey ? decrypt(data.encryptedApiKey) : "";

    const preset = getProviderPreset(data.providerId) || getProviderPreset(data.name);

    return {
      name: data.name || preset?.name || providerNameOrId,
      baseURL: data.baseURL || preset?.defaultBaseURL || "http://localhost:8000/v1",
      apiKey: decryptedKey,
      model: data.model || preset?.defaultModels[0] || "default-model",
      defaultModels: preset?.defaultModels ?? [data.model],
      supportsReasoning: data.supportsReasoning ?? preset?.supportsReasoning ?? false,
    };
  } catch (err: any) {
    return null;
  }
}

const DEFAULT_POINTER_FILE = join(ZERO_DIR, "default_config.json");

let inMemoryDefaultProvider: ProviderConfig | null = null;

/**
 * Retrieves the global default provider and model across all new sessions.
 * Reads from ./.zero/default_config.json or first saved ./.zero/[provider]_config.json.
 */
export function getGlobalDefaultProvider(): ProviderConfig {
  if (inMemoryDefaultProvider) {
    return { ...inMemoryDefaultProvider };
  }

  // 1. Check default pointer file ./.zero/default_config.json
  if (existsSync(DEFAULT_POINTER_FILE)) {
    try {
      const raw = readFileSync(DEFAULT_POINTER_FILE, "utf-8");
      const ptr = JSON.parse(raw);
      if (ptr.providerId) {
        const loaded = loadProviderConfig(ptr.providerId);
        if (loaded) {
          if (ptr.model) loaded.model = ptr.model;
          inMemoryDefaultProvider = loaded;
          return { ...inMemoryDefaultProvider };
        }
      }
    } catch {
      // Ignore
    }
  }

  // 2. Check if any ./.zero/*_config.json exists
  if (existsSync(ZERO_DIR)) {
    try {
      const files = readdirSync(ZERO_DIR);
      for (const file of files) {
        if (file.endsWith("_config.json") && file !== "default_config.json") {
          const providerId = file.replace(/_config\.json$/, "");
          const loaded = loadProviderConfig(providerId);
          if (loaded && (loaded.apiKey || loaded.name.includes("Local"))) {
            inMemoryDefaultProvider = loaded;
            return { ...inMemoryDefaultProvider };
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 3. Fallback to env vars or default preset
  inMemoryDefaultProvider = getDefaultProvider();
  return { ...inMemoryDefaultProvider };
}

/**
 * Sets the global default provider and model across all new sessions.
 * Saves to ./.zero/[provider]_config.json and ./.zero/default_config.json.
 */
export function setGlobalDefaultProvider(provider: ProviderConfig, persist = true): void {
  inMemoryDefaultProvider = { ...provider };

  if (persist) {
    // 1. Save provider config with encrypted key to ./.zero/[provider]_config.json
    saveProviderConfig(provider);

    // 2. Save pointer to ./.zero/default_config.json
    ensureZeroDir();
    try {
      writeFileSync(
        DEFAULT_POINTER_FILE,
        JSON.stringify(
          {
            providerId: normalizeProviderId(provider.name),
            model: provider.model,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        "utf-8"
      );
    } catch {
      // Ignore
    }
  }
}

/**
 * Updates only the global default model for new sessions.
 */
export function setGlobalDefaultModel(model: string, persist = true): void {
  const current = getGlobalDefaultProvider();
  current.model = model;
  setGlobalDefaultProvider(current, persist);
}

/**
 * Resets global defaults and removes stored config files.
 */
export function resetGlobalDefaults(): void {
  inMemoryDefaultProvider = getDefaultProvider();
  try {
    if (existsSync(ZERO_DIR)) {
      const files = readdirSync(ZERO_DIR);
      for (const file of files) {
        unlinkSync(join(ZERO_DIR, file));
      }
    }
  } catch {
    // Ignore
  }
}
