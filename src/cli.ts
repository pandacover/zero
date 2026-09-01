#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { Effect, Stream } from "effect";
import { createAgentLayer, runAgent } from "./agent.ts";
import {
  getGlobalDefaultProvider,
  loadProviderConfig,
  resetGlobalDefaults,
  saveProviderConfig,
  setGlobalDefaultModel,
  setGlobalDefaultProvider,
} from "./config.ts";
import {
  fetchAvailableModels,
  getProviderPreset,
  PROVIDER_PRESETS,
} from "./providers.ts";
import { Session } from "./session.ts";
import { Spinner } from "./ui/spinner.ts";

// Initialize a fresh active session inheriting global default provider & model
let activeSession = Session.createNew();

const spinner = new Spinner();

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.max(0, Math.floor(diff / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function printBanner(): void {
  console.log("\x1b[1m\x1b[36m=====================================================\x1b[0m");
  console.log("\x1b[1m\x1b[36m             ZERO AGENT - REPL CLI                   \x1b[0m");
  console.log("\x1b[1m\x1b[36m=====================================================\x1b[0m");
  console.log("Type your prompt or use slash commands:");
  console.log("  \x1b[33m/provider\x1b[0m - Connect to any OpenAI-compatible provider & set API key");
  console.log("  \x1b[33m/model\x1b[0m    - Select or switch model for active session");
  console.log("  \x1b[33m/default\x1b[0m  - Set/view global default provider & model for new sessions");
  console.log("  \x1b[33m/new\x1b[0m      - Create a new session (inherits global default provider & model)");
  console.log("  \x1b[33m/sessions\x1b[0m - List and switch between saved sessions");
  console.log("  \x1b[33m/config\x1b[0m   - View active session and global default configuration");
  console.log("  \x1b[33m/tools\x1b[0m    - View active coding tools (skill_discovery, bash, glob, grep, read, write, edit)");
  console.log("  \x1b[33m/history\x1b[0m  - View conversation history");
  console.log("  \x1b[33m/clear\x1b[0m    - Clear conversation memory of active session");
  console.log("  \x1b[33m/help\x1b[0m     - Show this help message");
  console.log("  \x1b[33m/exit\x1b[0m     - Exit the CLI");
  console.log("-----------------------------------------------------");
  printConfigSummary();
  console.log("-----------------------------------------------------\n");
}

function printConfigSummary(): void {
  const cfg = activeSession.getProvider();
  const defaultCfg = getGlobalDefaultProvider();

  const keyDisplay = cfg.apiKey
    ? cfg.apiKey === "not-needed"
      ? "(Not needed)"
      : `${cfg.apiKey.slice(0, 4)}...${cfg.apiKey.slice(-4)}`
    : "\x1b[31m(Not Set)\x1b[0m";

  console.log(`\x1b[1mActive Session ID:\x1b[0m  \x1b[36m${activeSession.id}\x1b[0m`);
  console.log(`\x1b[1mActive Provider:  \x1b[0m  \x1b[32m${cfg.name}\x1b[0m`);
  console.log(`\x1b[1mActive Model:     \x1b[0m  \x1b[35m${cfg.model}\x1b[0m`);
  console.log(`\x1b[1mBase URL:         \x1b[0m  ${cfg.baseURL}`);
  console.log(`\x1b[1mAPI Key:          \x1b[0m  ${keyDisplay}`);
  console.log(`\x1b[1mGlobal Default:   \x1b[0m  \x1b[33m${defaultCfg.name}\x1b[0m (\x1b[35m${defaultCfg.model}\x1b[0m)`);
  console.log(`\x1b[1mTools Enabled:    \x1b[0m  ${activeSession.getTools().map((t) => t.name).join(", ")}`);
}

async function handleProviderCommand(rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log("\n\x1b[1mSelect a Provider:\x1b[0m");
  PROVIDER_PRESETS.forEach((preset, index) => {
    const stored = loadProviderConfig(preset.id);
    const hasKey = stored?.apiKey ? " \x1b[32m[Encrypted key saved in ~/.zero/]\x1b[0m" : "";
    console.log(`  [${index + 1}] \x1b[33m${preset.name}\x1b[0m - ${preset.description}${hasKey}`);
  });

  const choiceStr = await rl.question("\nEnter provider number or ID (or press Enter to cancel): ");
  if (!choiceStr.trim()) return;

  let chosenPreset = null;
  const choiceNum = parseInt(choiceStr.trim(), 10);

  if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= PROVIDER_PRESETS.length) {
    chosenPreset = PROVIDER_PRESETS[choiceNum - 1];
  } else {
    chosenPreset = getProviderPreset(choiceStr.trim());
  }

  if (!chosenPreset) {
    console.log(`\x1b[31mInvalid provider selection.\x1b[0m`);
    return;
  }

  console.log(`\nSelected provider: \x1b[32m${chosenPreset.name}\x1b[0m`);

  // Check if existing stored config exists for this provider
  const storedConfig = loadProviderConfig(chosenPreset.id);

  // Prompt for Base URL
  const defaultBaseURL = storedConfig?.baseURL || chosenPreset.defaultBaseURL;
  const customBaseURL = await rl.question(`Base URL [${defaultBaseURL}]: `);
  const baseURL = customBaseURL.trim() || defaultBaseURL;

  // Prompt for API Key
  const storedKey = storedConfig?.apiKey || (chosenPreset.apiKeyEnvVar ? process.env[chosenPreset.apiKeyEnvVar] : "");
  let keyPrompt = "";
  if (storedKey) {
    const masked = `${storedKey.slice(0, 4)}...${storedKey.slice(-4)}`;
    keyPrompt = `API Key [press Enter to keep stored key: ${masked}]: `;
  } else if (chosenPreset.requiresApiKey) {
    keyPrompt = `API Key: `;
  } else {
    keyPrompt = `API Key [optional, default 'not-needed']: `;
  }

  const inputKey = await rl.question(keyPrompt);
  let apiKey = inputKey.trim();

  if (!apiKey) {
    apiKey = storedKey || (chosenPreset.requiresApiKey ? "" : "not-needed");
  }

  const defaultModel = storedConfig?.model || chosenPreset.defaultModels[0] || "default-model";

  const newConfig = {
    name: chosenPreset.name,
    baseURL,
    apiKey,
    model: defaultModel,
    defaultModels: chosenPreset.defaultModels,
    supportsReasoning: chosenPreset.supportsReasoning,
  };

  // Save encrypted provider config to ~/.zero/[provider]_config.json
  saveProviderConfig(newConfig);
  activeSession.setProvider(newConfig);
  activeSession.save();

  console.log(`\n\x1b[32m✔ Connected active session to ${chosenPreset.name} (Model: ${defaultModel})\x1b[0m`);
  console.log(`\x1b[90m  Encrypted configuration saved to ~/.zero/${chosenPreset.id}_config.json\x1b[0m`);

  const setAsDefault = await rl.question("Set this provider as global default for future new sessions? (y/N): ");
  if (setAsDefault.trim().toLowerCase() === "y" || setAsDefault.trim().toLowerCase() === "yes") {
    setGlobalDefaultProvider(newConfig);
    console.log(`\x1b[32m✔ Saved '${chosenPreset.name}' (${defaultModel}) as global default.\x1b[0m\n`);
  } else {
    console.log();
  }
}

async function handleModelCommand(rl: ReturnType<typeof createInterface>): Promise<void> {
  const currentProvider = activeSession.getProvider();
  console.log(`\nFetching models for \x1b[33m${currentProvider.name}\x1b[0m (${currentProvider.baseURL})...`);

  spinner.start("Discovering available models...");
  const models = await fetchAvailableModels(currentProvider);
  spinner.stop();

  console.log("\n\x1b[1mAvailable Models:\x1b[0m");
  const modelList = Array.from(new Set([...currentProvider.defaultModels, ...models]));

  modelList.forEach((m, idx) => {
    const isCurrent = m === currentProvider.model ? " \x1b[32m(active)\x1b[0m" : "";
    console.log(`  [${idx + 1}] \x1b[35m${m}\x1b[0m${isCurrent}`);
  });
  console.log(`  [0] \x1b[90mEnter custom model name manually\x1b[0m`);

  const choiceStr = await rl.question("\nEnter model number or custom model name (Enter to cancel): ");
  if (!choiceStr.trim()) return;

  let selectedModel = "";
  const choiceNum = parseInt(choiceStr.trim(), 10);
  if (!isNaN(choiceNum)) {
    if (choiceNum === 0) {
      const customModel = await rl.question("Enter custom model name: ");
      selectedModel = customModel.trim();
    } else if (choiceNum >= 1 && choiceNum <= modelList.length) {
      selectedModel = modelList[choiceNum - 1]!;
    }
  } else {
    selectedModel = choiceStr.trim();
  }

  if (selectedModel) {
    activeSession.setModel(selectedModel);

    // Ensure API key is preserved
    const updatedProvider = activeSession.getProvider();
    if (!updatedProvider.apiKey) {
      const stored = loadProviderConfig(updatedProvider.name);
      if (stored?.apiKey) {
        updatedProvider.apiKey = stored.apiKey;
        activeSession.setApiKey(stored.apiKey);
      }
    }

    saveProviderConfig(updatedProvider);
    activeSession.save();
    console.log(`\x1b[32m✔ Switched active session model to '${selectedModel}'.\x1b[0m`);

    const setAsDefault = await rl.question("Set this model as default for future new sessions? (y/N): ");
    if (setAsDefault.trim().toLowerCase() === "y" || setAsDefault.trim().toLowerCase() === "yes") {
      setGlobalDefaultProvider(activeSession.getProvider());
      console.log(`\x1b[32m✔ Saved '${activeSession.getProvider().name}' with model '${selectedModel}' as global default.\x1b[0m\n`);
    } else {
      console.log();
    }
  }
}

async function handleDefaultCommand(rl: ReturnType<typeof createInterface>): Promise<void> {
  const currentDefault = getGlobalDefaultProvider();
  console.log("\n\x1b[1mGlobal Default Settings (applied to all new sessions):\x1b[0m");
  console.log(`  Default Provider: \x1b[32m${currentDefault.name}\x1b[0m`);
  console.log(`  Default Model:    \x1b[35m${currentDefault.model}\x1b[0m`);
  console.log(`  Base URL:         ${currentDefault.baseURL}`);
  console.log();
  console.log("Options:");
  console.log("  [1] Set current session's provider & model as global default");
  console.log("  [2] Select a different default provider");
  console.log("  [3] Reset defaults to factory settings");
  console.log("  [0] Cancel");

  const choice = await rl.question("\nChoose an option [0-3]: ");
  switch (choice.trim()) {
    case "1": {
      const current = activeSession.getProvider();
      if (!current.apiKey) {
        const stored = loadProviderConfig(current.name);
        if (stored?.apiKey) {
          current.apiKey = stored.apiKey;
        }
      }
      setGlobalDefaultProvider(current);
      console.log(`\x1b[32m✔ Global default updated to: ${current.name} (${current.model})\x1b[0m\n`);
      break;
    }
    case "2": {
      console.log("\nSelect Provider for Default:");
      PROVIDER_PRESETS.forEach((preset, index) => {
        const stored = loadProviderConfig(preset.id);
        const hasKey = stored?.apiKey ? " \x1b[32m(key stored)\x1b[0m" : "";
        console.log(`  [${index + 1}] \x1b[33m${preset.name}\x1b[0m${hasKey}`);
      });
      const pChoice = await rl.question("Enter provider number: ");
      const pIdx = parseInt(pChoice.trim(), 10) - 1;
      if (pIdx >= 0 && pIdx < PROVIDER_PRESETS.length) {
        const preset = PROVIDER_PRESETS[pIdx]!;
        const stored = loadProviderConfig(preset.id);
        let apiKey = stored?.apiKey || (preset.apiKeyEnvVar ? process.env[preset.apiKeyEnvVar] || "" : "");
        if (!apiKey && preset.requiresApiKey) {
          apiKey = await rl.question(`Enter API Key for ${preset.name}: `);
        }
        if (!apiKey && !preset.requiresApiKey) {
          apiKey = "not-needed";
        }
        const cfg = {
          name: preset.name,
          baseURL: stored?.baseURL || preset.defaultBaseURL,
          apiKey: apiKey.trim(),
          model: stored?.model || preset.defaultModels[0] || "default-model",
          defaultModels: preset.defaultModels,
          supportsReasoning: preset.supportsReasoning,
        };
        setGlobalDefaultProvider(cfg);
        console.log(`\x1b[32m✔ Global default set to: ${cfg.name} (${cfg.model})\x1b[0m\n`);
      }
      break;
    }
    case "3":
      resetGlobalDefaults();
      console.log(`\x1b[32m✔ Reset default pointer to factory settings.\x1b[0m\n`);
      break;
    default:
      console.log();
      break;
  }
}

function handleNewSessionCommand(): void {
  const newSess = Session.createNew();
  activeSession = newSess;
  const cfg = activeSession.getProvider();
  console.log(`\x1b[32m✔ Created new session '${newSess.id}' with default provider: ${cfg.name} (${cfg.model}).\x1b[0m\n`);
}

async function handleSessionsCommand(rl: ReturnType<typeof createInterface>): Promise<void> {
  // Ensure current active session is saved
  activeSession.save();

  const savedList = Session.listAll();
  console.log(`\n\x1b[1mSaved Sessions (${savedList.length}):\x1b[0m`);

  if (savedList.length === 0) {
    console.log("  (No saved sessions found. Use /new to create a session)\n");
    return;
  }

  savedList.forEach((s, idx) => {
    const isCur = s.id === activeSession.id ? " \x1b[32m(active)\x1b[0m" : "";
    const p = s.provider;
    const timeAgo = formatRelativeTime(s.updatedAt || s.createdAt);
    console.log(
      `  [${idx + 1}] ID: \x1b[36m${s.id}\x1b[0m | \x1b[33m${p.name}\x1b[0m (\x1b[35m${p.model}\x1b[0m) | ${s.history.length} msgs | ${timeAgo}${isCur}`
    );
  });

  console.log("\nActions:");
  console.log("  - Enter number [1-" + savedList.length + "] to switch session");
  console.log("  - Type 'new' to create a new session");
  console.log("  - Type 'del <number>' to delete a session");
  console.log("  - Press Enter to cancel");

  const choiceStr = await rl.question("\nAction: ");
  const trimmed = choiceStr.trim();
  if (!trimmed) return;

  if (trimmed.toLowerCase() === "new") {
    handleNewSessionCommand();
    return;
  }

  if (trimmed.toLowerCase().startsWith("del ") || trimmed.toLowerCase().startsWith("delete ")) {
    const numPart = trimmed.replace(/^(del|delete)\s+/i, "");
    const delIdx = parseInt(numPart, 10) - 1;
    if (delIdx >= 0 && delIdx < savedList.length) {
      const target = savedList[delIdx]!;
      Session.delete(target.id);
      console.log(`\x1b[32m✔ Deleted session '${target.id}'.\x1b[0m`);
      if (activeSession.id === target.id) {
        handleNewSessionCommand();
      }
      console.log();
      return;
    }
  }

  const choiceNum = parseInt(trimmed, 10);
  if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= savedList.length) {
    const selectedSnapshot = savedList[choiceNum - 1]!;
    const loaded = Session.load(selectedSnapshot.id);
    if (loaded) {
      activeSession = loaded;
      const p = activeSession.getProvider();
      console.log(
        `\x1b[32m✔ Switched to session '${activeSession.id}' (${p.name} - ${p.model}, ${activeSession.getHistory().length} messages).\x1b[0m\n`
      );
    }
  } else {
    console.log();
  }
}

export async function runCLI(): Promise<void> {
  printBanner();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    let input = "";
    try {
      input = await rl.question(`\x1b[1m\x1b[34m[${activeSession.id}] User >\x1b[0m `);
    } catch {
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // Handle Slash Commands
    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(" ");
      const cmd = parts[0]!.toLowerCase();

      switch (cmd) {
        case "/exit":
        case "/quit":
          activeSession.save();
          console.log("\nExiting Zero Agent. Goodbye!");
          rl.close();
          process.exit(0);

        case "/help":
          printBanner();
          break;

        case "/config":
          console.log("\n-----------------------------------------------------");
          printConfigSummary();
          console.log("-----------------------------------------------------\n");
          break;

        case "/default":
        case "/setdefault":
          await handleDefaultCommand(rl);
          break;

        case "/new":
          handleNewSessionCommand();
          break;

        case "/sessions":
        case "/session":
          await handleSessionsCommand(rl);
          break;

        case "/clear":
        case "/reset":
          activeSession.clearHistory();
          console.log("\x1b[32m✔ Active session conversation history cleared.\x1b[0m\n");
          break;

        case "/history": {
          const hist = activeSession.getHistory();
          console.log(`\n\x1b[1mSession '${activeSession.id}' History (${hist.length} messages):\x1b[0m`);
          if (hist.length === 0) {
            console.log("  (Empty)\n");
          } else {
            hist.forEach((m, i) => {
              const roleTag =
                m.role === "user"
                  ? "\x1b[34m[User]\x1b[0m"
                  : m.role === "assistant"
                  ? "\x1b[32m[Assistant]\x1b[0m"
                  : m.role === "tool"
                  ? `\x1b[33m[Tool: ${m.name || "result"}]\x1b[0m`
                  : "\x1b[90m[System]\x1b[0m";
              const snippet = (m.content || "").slice(0, 120);
              console.log(`  ${i + 1}. ${roleTag} ${snippet}${snippet.length >= 120 ? "..." : ""}`);
              if (m.thought) {
                const thoughtSnippet = m.thought.length > 120 ? m.thought.slice(0, 120) + "..." : m.thought;
                console.log(`     \x1b[35m[Think]\x1b[0m \x1b[90m${thoughtSnippet.replace(/\n/g, " ")}\x1b[0m`);
              }
            });
            console.log();
          }
          break;
        }

        case "/tools":
          console.log("\n\x1b[1mActive Coding Tools:\x1b[0m");
          activeSession.getTools().forEach((t) => {
            console.log(`  - \x1b[33m${t.name}\x1b[0m: ${t.description}`);
          });
          console.log();
          break;

        case "/provider":
        case "/connect":
          await handleProviderCommand(rl);
          break;

        case "/model":
          await handleModelCommand(rl);
          break;

        default:
          console.log(`\x1b[31mUnknown command: '${cmd}'. Type /help for available commands.\x1b[0m\n`);
          break;
      }
      continue;
    }

    // Normal query -> Run Agent loop
    const providerConfig = activeSession.getProvider();
    if (!providerConfig.apiKey && providerConfig.name !== "Ollama (Local)" && providerConfig.name !== "LM Studio (Local)") {
      console.log(`\x1b[33mWarning: No API key set for ${providerConfig.name}. Use /provider to configure your API key.\x1b[0m\n`);
    }

    // Add user prompt to history and initialize turn record
    const priorHistory = activeSession.getHistory();
    activeSession.addMessage({ role: "user", content: trimmed });
    const turn = activeSession.startTurn(trimmed);

    try {
      const stream = runAgent(
        trimmed,
        priorHistory,
        providerConfig,
        {
          systemPrompt: activeSession.getSystemPrompt(),
        }
      );

      const agentLayer = createAgentLayer({
        tools: activeSession.getTools(),
      });

      const program = stream.pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            switch (event.type) {
              case "think:start":
                spinner.start("Thinking...");
                break;

              case "think:complete":
                spinner.stop();
                console.log(`\x1b[35m🧠 Think (${event.durationMs}ms):\x1b[0m`);
                console.log(`\x1b[90m${event.thought.trim().replace(/^/gm, "  ")}\x1b[0m\n`);
                activeSession.recordTurnStep(turn.turnIndex, {
                  type: "think",
                  thought: event.thought,
                  durationMs: event.durationMs,
                });
                break;

              case "tool:start": {
                const argsSummary = Object.entries(event.args)
                  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                  .join(", ");
                spinner.start(`Executing tool '\x1b[33m${event.toolName}\x1b[0m' (${argsSummary})...`);
                break;
              }

              case "tool:complete": {
                const parsed = event.parsed;
                const isSuccess = parsed?.outcome === "success";
                const isToolError = parsed?.toolStatus === "tool_error";

                if (isToolError) {
                  spinner.fail(`[${event.toolName}] tool error (${event.durationMs}ms)`);
                  if (parsed?.error?.message) {
                    console.log(`\x1b[31m  Error: ${parsed.error.message}\x1b[0m\n`);
                  }
                } else if (parsed?.outcome === "failure" || parsed?.outcome === "timeout") {
                  spinner.fail(`[${event.toolName}] ${parsed.outcome} (${event.durationMs}ms)`);
                  if (parsed.execution?.exitCode !== null && parsed.execution?.exitCode !== undefined) {
                    console.log(`\x1b[31m  Exit Code: ${parsed.execution.exitCode}\x1b[0m`);
                  }
                  if (parsed.execution?.stdout) {
                    const outSnippet = parsed.execution.stdout.length > 250
                      ? parsed.execution.stdout.slice(0, 250) + "..."
                      : parsed.execution.stdout;
                    console.log(`\x1b[90m  ${outSnippet.replace(/\n/g, "\n  ")}\x1b[0m`);
                  }
                  if (parsed.execution?.stderr) {
                    const errSnippet = parsed.execution.stderr.length > 250
                      ? parsed.execution.stderr.slice(0, 250) + "..."
                      : parsed.execution.stderr;
                    console.log(`\x1b[31m  ${errSnippet.replace(/\n/g, "\n  ")}\x1b[0m`);
                  }
                  console.log();
                } else if (parsed?.outcome === "not_found" || parsed?.outcome === "mismatch" || parsed?.outcome === "invalid_target") {
                  spinner.warn(`[${event.toolName}] ${parsed.outcome} (${event.durationMs}ms)`);
                  if (parsed.error?.message) {
                    console.log(`\x1b[33m  Notice: ${parsed.error.message}\x1b[0m\n`);
                  }
                } else {
                  spinner.succeed(`[${event.toolName}] completed (${event.durationMs}ms)`);
                  const snippet = event.result.length > 200 ? event.result.slice(0, 200) + "..." : event.result;
                  console.log(`\x1b[90m  Result: ${snippet.replace(/\n/g, "\n  ")}\x1b[0m\n`);
                }

                activeSession.recordTurnStep(turn.turnIndex, {
                  type: "tool",
                  toolName: event.toolName,
                  args: event.args,
                  callId: event.callId,
                  result: event.result,
                  durationMs: event.durationMs,
                  toolStatus: parsed?.toolStatus,
                  outcome: parsed?.outcome,
                });
                break;
              }

              case "response:start":
                spinner.start("");
                break;

              case "response:complete":
                spinner.stop();
                console.log(`\n\x1b[1m\x1b[32mAgent:\x1b[0m\n${event.content}\n`);
                activeSession.recordTurnStep(turn.turnIndex, {
                  type: "response",
                  content: event.content,
                  durationMs: event.durationMs,
                  usage: event.usage,
                });
                break;

              case "done":
                activeSession.setHistory(event.history);
                activeSession.completeTurn(turn.turnIndex, {
                  status: "success",
                  finalResponse: event.finalResponse,
                  totalDurationMs: event.totalDurationMs,
                });
                break;

              case "error":
                spinner.fail(`Error (${event.phase}): ${event.message}`);
                console.log();
                activeSession.recordTurnStep(turn.turnIndex, {
                  type: "error",
                  message: event.message,
                  phase: event.phase,
                });
                activeSession.completeTurn(turn.turnIndex, {
                  status: "error",
                  error: { message: event.message, phase: event.phase },
                });
                break;
            }
          })
        ),
        Effect.provide(agentLayer)
      );

      await Effect.runPromise(program);
    } catch (err: any) {
      spinner.stop();
      console.log(`\x1b[31mExecution failed: ${err.message || String(err)}\x1b[0m\n`);
      const existingTurn = activeSession.getTurn(turn.turnIndex);
      if (existingTurn && existingTurn.status === "in_progress") {
        activeSession.recordTurnStep(turn.turnIndex, {
          type: "error",
          message: err.message || String(err),
          phase: "response",
        });
        activeSession.completeTurn(turn.turnIndex, {
          status: "error",
          error: { message: err.message || String(err), phase: "response" },
        });
      }
    }
  }
}

if (import.meta.main) {
  runCLI().catch((err) => {
    console.error("CLI crashed:", err);
  });
}
