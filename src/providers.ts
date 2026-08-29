import type { ProviderConfig } from "./types.ts";

export interface ProviderPreset {
  id: string;
  name: string;
  defaultBaseURL: string;
  defaultModels: string[];
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  description: string;
  supportsReasoning?: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseURL: "https://api.openai.com/v1",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"],
    requiresApiKey: true,
    apiKeyEnvVar: "OPENAI_API_KEY",
    description: "Industry standard models with native tool calling and reasoning",
    supportsReasoning: true,
  },
  {
    id: "groq",
    name: "Groq",
    defaultBaseURL: "https://api.groq.com/openai/v1",
    defaultModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "deepseek-r1-distill-llama-70b",
      "mixtral-8x7b-32768",
    ],
    requiresApiKey: true,
    apiKeyEnvVar: "GROQ_API_KEY",
    description: "Ultra-fast inference for open models",
    supportsReasoning: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    defaultModels: [
      "anthropic/claude-3.5-sonnet",
      "deepseek/deepseek-r1",
      "meta-llama/llama-3.3-70b-instruct",
      "openai/gpt-4o",
    ],
    requiresApiKey: true,
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    description: "Unified access to hundreds of models",
    supportsReasoning: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseURL: "https://api.deepseek.com/v1",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    requiresApiKey: true,
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    description: "DeepSeek-V3 and DeepSeek-R1 with native reasoning",
    supportsReasoning: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    defaultBaseURL: "http://localhost:11434/v1",
    defaultModels: ["llama3.2", "qwen2.5-coder", "mistral", "deepseek-r1:8b"],
    requiresApiKey: false,
    apiKeyEnvVar: "OLLAMA_API_KEY",
    description: "Free local models running directly on your machine",
    supportsReasoning: true,
  },
  {
    id: "lmstudio",
    name: "LM Studio (Local)",
    defaultBaseURL: "http://localhost:1234/v1",
    defaultModels: ["local-model"],
    requiresApiKey: false,
    apiKeyEnvVar: "LMSTUDIO_API_KEY",
    description: "Local GUI model server with OpenAI-compatible API",
    supportsReasoning: false,
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    defaultBaseURL: "http://localhost:8000/v1",
    defaultModels: ["custom-model"],
    requiresApiKey: false,
    description: "Any custom self-hosted or proxy OpenAI-compatible endpoint",
    supportsReasoning: false,
  },
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(
    (p) => p.id.toLowerCase() === id.toLowerCase() || p.name.toLowerCase() === id.toLowerCase()
  );
}

export function createProviderConfig(preset: ProviderPreset, custom?: Partial<ProviderConfig>): ProviderConfig {
  const envKey = preset.apiKeyEnvVar ? process.env[preset.apiKeyEnvVar] : undefined;
  const apiKey = custom?.apiKey || envKey || (preset.requiresApiKey ? "" : "not-needed");
  const baseURL = custom?.baseURL || preset.defaultBaseURL;
  const model = custom?.model || preset.defaultModels[0] || "default-model";

  return {
    name: preset.name,
    baseURL,
    apiKey,
    model,
    defaultModels: preset.defaultModels,
    supportsReasoning: preset.supportsReasoning,
  };
}

export function getDefaultProvider(): ProviderConfig {
  if (process.env.GROQ_API_KEY) {
    const preset = getProviderPreset("groq")!;
    return createProviderConfig(preset, { apiKey: process.env.GROQ_API_KEY });
  }
  if (process.env.OPENAI_API_KEY) {
    const preset = getProviderPreset("openai")!;
    return createProviderConfig(preset, { apiKey: process.env.OPENAI_API_KEY });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    const preset = getProviderPreset("deepseek")!;
    return createProviderConfig(preset, { apiKey: process.env.DEEPSEEK_API_KEY });
  }
  if (process.env.OPENROUTER_API_KEY) {
    const preset = getProviderPreset("openrouter")!;
    return createProviderConfig(preset, { apiKey: process.env.OPENROUTER_API_KEY });
  }

  // Default to Groq or Ollama preset
  const preset = getProviderPreset("groq") || getProviderPreset("openai") || PROVIDER_PRESETS[0]!;
  return createProviderConfig(preset);
}

export async function fetchAvailableModels(config: ProviderConfig): Promise<string[]> {
  try {
    const url = `${config.baseURL.replace(/\/+$/, "")}/models`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.apiKey && config.apiKey !== "not-needed") {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      return config.defaultModels;
    }

    const data = (await res.json()) as any;
    if (Array.isArray(data?.data)) {
      const models = data.data.map((m: any) => m.id).filter(Boolean);
      return models.length > 0 ? models : config.defaultModels;
    }
    return config.defaultModels;
  } catch {
    return config.defaultModels;
  }
}
