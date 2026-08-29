import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

/**
 * Returns the base configuration directory (~/.zero or overridden by ZERO_CONFIG_DIR).
 */
export function getZeroDir(): string {
  return process.env.ZERO_CONFIG_DIR || join(homedir(), ".zero");
}

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
 * Gets path to the provider config file: ~/.zero/[provider]_config.json
 */
export function getProviderConfigFilePath(providerNameOrId: string): string {
  const id = normalizeProviderId(providerNameOrId);
  return join(getZeroDir(), `${id}_config.json`);
}

/**
 * Ensures the ~/.zero directory exists.
 */
function ensureZeroDir(): void {
  const dir = getZeroDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Saves a provider configuration to ~/.zero/[provider]_config.json with encrypted API key.
 * If the incoming provider has an empty apiKey, preserves any previously stored key to prevent accidental wipes.
 */
export function saveProviderConfig(provider: ProviderConfig): void {
  ensureZeroDir();
  const id = normalizeProviderId(provider.name);
  const filePath = getProviderConfigFilePath(id);

  let apiKeyToStore = provider.apiKey;

  // Protect against overwriting existing key with empty string
  if (!apiKeyToStore) {
    const existing = loadProviderConfig(id);
    if (existing?.apiKey) {
      apiKeyToStore = existing.apiKey;
      provider.apiKey = existing.apiKey;
    }
  }

  const encryptedKey = apiKeyToStore ? encrypt(apiKeyToStore) : "";

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
 * Loads a provider configuration from ~/.zero/[provider]_config.json and decrypts the API key.
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

/**
 * Deletes a specific provider configuration file.
 */
export function deleteProviderConfig(providerNameOrId: string): boolean {
  const filePath = getProviderConfigFilePath(providerNameOrId);
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

function getDefaultPointerFile(): string {
  return join(getZeroDir(), "default_config.json");
}

let inMemoryDefaultProvider: ProviderConfig | null = null;

/**
 * Retrieves the global default provider and model across all new sessions.
 * Reads from ~/.zero/default_config.json or first saved ~/.zero/[provider]_config.json.
 */
export function getGlobalDefaultProvider(forceReload = false): ProviderConfig {
  if (inMemoryDefaultProvider && !forceReload) {
    return { ...inMemoryDefaultProvider };
  }

  const defaultPointer = getDefaultPointerFile();

  // 1. Check default pointer file ~/.zero/default_config.json
  if (existsSync(defaultPointer)) {
    try {
      const raw = readFileSync(defaultPointer, "utf-8");
      const ptr = JSON.parse(raw);
      if (ptr.providerId) {
        const loaded = loadProviderConfig(ptr.providerId);
        if (loaded) {
          if (ptr.model) loaded.model = ptr.model;
          inMemoryDefaultProvider = loaded;
          return { ...loaded };
        }
      }
    } catch {
      // Ignore
    }
  }

  // 2. Check if any ~/.zero/*_config.json exists
  const dir = getZeroDir();
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (file.endsWith("_config.json") && file !== "default_config.json") {
          const providerId = file.replace(/_config\.json$/, "");
          const loaded = loadProviderConfig(providerId);
          if (loaded && (loaded.apiKey || loaded.name.includes("Local"))) {
            inMemoryDefaultProvider = loaded;
            return { ...loaded };
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
 * Saves to ~/.zero/[provider]_config.json and ~/.zero/default_config.json.
 */
export function setGlobalDefaultProvider(provider: ProviderConfig, persist = true): void {
  // Ensure provider has decrypted API key restored if empty
  if (!provider.apiKey) {
    const existing = loadProviderConfig(provider.name);
    if (existing?.apiKey) {
      provider.apiKey = existing.apiKey;
    }
  }

  inMemoryDefaultProvider = { ...provider };

  if (persist) {
    // 1. Save provider config with encrypted key to ~/.zero/[provider]_config.json
    saveProviderConfig(provider);

    // 2. Save pointer to ~/.zero/default_config.json
    ensureZeroDir();
    try {
      writeFileSync(
        getDefaultPointerFile(),
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
 * Resets global defaults pointer (removes ~/.zero/default_config.json).
 */
export function resetGlobalDefaults(): void {
  inMemoryDefaultProvider = null;
  try {
    const defaultPointer = getDefaultPointerFile();
    if (existsSync(defaultPointer)) {
      unlinkSync(defaultPointer);
    }
  } catch {
    // Ignore
  }
}
