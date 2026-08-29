import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDefaultProvider, getProviderPreset, PROVIDER_PRESETS } from "./providers.ts";
import type { ProviderConfig } from "./types.ts";

export interface StoredConfig {
  defaultProvider: {
    name: string;
    baseURL: string;
    apiKey: string;
    model: string;
    supportsReasoning?: boolean;
  };
}

const CONFIG_FILE_PATH = resolve(".zero-config.json");

let inMemoryDefaultProvider: ProviderConfig | null = null;

/**
 * Loads stored config from .zero-config.json if it exists.
 */
function loadPersistedConfig(): StoredConfig | null {
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      const content = readFileSync(CONFIG_FILE_PATH, "utf-8");
      return JSON.parse(content) as StoredConfig;
    }
  } catch {
    // Ignore corrupt or unreadable config
  }
  return null;
}

/**
 * Saves config to .zero-config.json.
 */
function savePersistedConfig(config: StoredConfig): void {
  try {
    writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Ignore write errors (e.g. read-only environments)
  }
}

/**
 * Retrieves the global default provider and model across all new sessions.
 */
export function getGlobalDefaultProvider(): ProviderConfig {
  if (inMemoryDefaultProvider) {
    return { ...inMemoryDefaultProvider };
  }

  // Check persisted config file
  const persisted = loadPersistedConfig();
  if (persisted?.defaultProvider) {
    const preset = getProviderPreset(persisted.defaultProvider.name);
    inMemoryDefaultProvider = {
      name: persisted.defaultProvider.name,
      baseURL: persisted.defaultProvider.baseURL,
      apiKey: persisted.defaultProvider.apiKey,
      model: persisted.defaultProvider.model,
      defaultModels: preset?.defaultModels ?? [persisted.defaultProvider.model],
      supportsReasoning: persisted.defaultProvider.supportsReasoning ?? preset?.supportsReasoning ?? false,
    };
    return { ...inMemoryDefaultProvider };
  }

  // Fallback to environment variables or standard presets
  inMemoryDefaultProvider = getDefaultProvider();
  return { ...inMemoryDefaultProvider };
}

/**
 * Sets the global default provider and model across all new sessions.
 * Optionally persists to .zero-config.json.
 */
export function setGlobalDefaultProvider(provider: ProviderConfig, persist = true): void {
  inMemoryDefaultProvider = { ...provider };

  if (persist) {
    savePersistedConfig({
      defaultProvider: {
        name: provider.name,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        model: provider.model,
        supportsReasoning: provider.supportsReasoning,
      },
    });
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
 * Resets global defaults to factory settings.
 */
export function resetGlobalDefaults(): void {
  inMemoryDefaultProvider = getDefaultProvider();
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      const { unlinkSync } = require("node:fs");
      unlinkSync(CONFIG_FILE_PATH);
    }
  } catch {
    // Ignore
  }
}
