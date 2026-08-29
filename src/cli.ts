import { createInterface } from "node:readline/promises";
import { Agent } from "./agent.ts";
import {
  getGlobalDefaultProvider,
  resetGlobalDefaults,
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

let activeSession = new Session();
const sessions = new Map<string, Session>([[activeSession.id, activeSession]]);
const spinner = new Spinner();

function printBanner(): void {
  console.log("\x1b[1m\x1b[36m=====================================================\x1b[0m");
  console.log("\x1b[1m\x1b[36m             ZERO AGENT - REPL CLI                   \x1b[0m");
  console.log("\x1b[1m\x1b[36m=====================================================\x1b[0m");
  console.log("Type your prompt or use slash commands:");
  console.log("  \x1b[33m/provider\x1b[0m - Connect to any OpenAI-compatible provider & set API key");
  console.log("  \x1b[33m/model\x1b[0m    - Select or switch model for active session");
  console.log("  \x1b[33m/default\x1b[0m  - Set/view global default provider & model for new sessions");
  console.log("  \x1b[33m/new\x1b[0m      - Create a new session (inherits global default provider & model)");
  console.log("  \x1b[33m/sessions\x1b[0m - List and switch between active sessions");
  console.log("  \x1b[33m/config\x1b[0m   - View active session and global default configuration");
  console.log("  \x1b[33m/tools\x1b[0m    - View active coding tools (glob, grep, read, write, edit)");
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
    console.log(`  [${index + 1}] \x1b[33m${preset.name}\x1b[0m - ${preset.description}`);
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

  // Prompt for Base URL
  const customBaseURL = await rl.question(`Base URL [${chosenPreset.defaultBaseURL}]: `);
  const baseURL = customBaseURL.trim() || chosenPreset.defaultBaseURL;

  // Prompt for API Key
  const currentKey = activeSession.getProvider().apiKey;
  const keyPrompt = chosenPreset.requiresApiKey
    ? `API Key (leave blank to use env var or current): `
    : `API Key [optional, default 'not-needed']: `;

  const inputKey = await rl.question(keyPrompt);
  let apiKey = inputKey.trim();

  if (!apiKey) {
    const envKey = chosenPreset.apiKeyEnvVar ? process.env[chosenPreset.apiKeyEnvVar] : undefined;
    apiKey = envKey || currentKey || (chosenPreset.requiresApiKey ? "" : "not-needed");
  }

  const defaultModel = chosenPreset.defaultModels[0] || "default-model";

  const newConfig = {
    name: chosenPreset.name,
    baseURL,
    apiKey,
    model: defaultModel,
    defaultModels: chosenPreset.defaultModels,
    supportsReasoning: chosenPreset.supportsReasoning,
  };

  activeSession.setProvider(newConfig);
  console.log(`\n\x1b[32m✔ Connected active session to ${chosenPreset.name} (Model: ${defaultModel})\x1b[0m`);

  const setAsDefault = await rl.question("Set this provider as global default for future new sessions? (y/N): ");
  if (setAsDefault.trim().toLowerCase() === "y" || setAsDefault.trim().toLowerCase() === "yes") {
    setGlobalDefaultProvider(newConfig);
    console.log(`\x1b[32m✔ Saved as global default.\x1b[0m\n`);
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
    console.log(`\x1b[32m✔ Switched active session model to '${selectedModel}'.\x1b[0m`);

    const setAsDefault = await rl.question("Set this model as default for future new sessions? (y/N): ");
    if (setAsDefault.trim().toLowerCase() === "y" || setAsDefault.trim().toLowerCase() === "yes") {
      setGlobalDefaultModel(selectedModel);
      console.log(`\x1b[32m✔ Saved '${selectedModel}' as global default model.\x1b[0m\n`);
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
      setGlobalDefaultProvider(current);
      console.log(`\x1b[32m✔ Global default updated to: ${current.name} (${current.model})\x1b[0m\n`);
      break;
    }
    case "2": {
      console.log("\nSelect Provider for Default:");
      PROVIDER_PRESETS.forEach((preset, index) => {
        console.log(`  [${index + 1}] \x1b[33m${preset.name}\x1b[0m`);
      });
      const pChoice = await rl.question("Enter provider number: ");
      const pIdx = parseInt(pChoice.trim(), 10) - 1;
      if (pIdx >= 0 && pIdx < PROVIDER_PRESETS.length) {
        const preset = PROVIDER_PRESETS[pIdx]!;
        const apiKey = preset.apiKeyEnvVar ? process.env[preset.apiKeyEnvVar] || "" : "not-needed";
        const cfg = {
          name: preset.name,
          baseURL: preset.defaultBaseURL,
          apiKey,
          model: preset.defaultModels[0] || "default-model",
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
      console.log(`\x1b[32m✔ Reset global defaults to factory settings.\x1b[0m\n`);
      break;
    default:
      console.log();
      break;
  }
}

function handleNewSessionCommand(): void {
  const newSess = Session.createNew();
  sessions.set(newSess.id, newSess);
  activeSession = newSess;
  const cfg = activeSession.getProvider();
  console.log(`\x1b[32m✔ Created new session '${newSess.id}' with global default provider: ${cfg.name} (${cfg.model}).\x1b[0m\n`);
}

async function handleSessionsCommand(rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log(`\n\x1b[1mActive Sessions (${sessions.size}):\x1b[0m`);
  const list = Array.from(sessions.values());
  list.forEach((s, idx) => {
    const isCur = s.id === activeSession.id ? " \x1b[32m(active)\x1b[0m" : "";
    const p = s.getProvider();
    console.log(`  [${idx + 1}] ID: \x1b[36m${s.id}\x1b[0m - Provider: \x1b[33m${p.name}\x1b[0m (${p.model}) - Messages: ${s.getHistory().length}${isCur}`);
  });

  const choiceStr = await rl.question("\nEnter session number to switch to (or Enter to cancel): ");
  const choiceNum = parseInt(choiceStr.trim(), 10);
  if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= list.length) {
    activeSession = list[choiceNum - 1]!;
    console.log(`\x1b[32m✔ Switched to session '${activeSession.id}'.\x1b[0m\n`);
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

    try {
      const generator = Agent.run(
        trimmed,
        activeSession.getHistory(),
        providerConfig,
        {
          systemPrompt: activeSession.getSystemPrompt(),
          tools: activeSession.getTools(),
        }
      );

      for await (const event of generator) {
        switch (event.type) {
          case "think:start":
            spinner.start("Thinking...");
            break;

          case "think:complete":
            spinner.stop();
            console.log(`\x1b[90m💭 Thought (${event.durationMs}ms):\n${event.thought}\x1b[0m\n`);
            break;

          case "tool:start": {
            const argsSummary = Object.entries(event.args)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ");
            spinner.start(`Executing tool '\x1b[33m${event.toolName}\x1b[0m' (${argsSummary})...`);
            break;
          }

          case "tool:complete": {
            spinner.succeed(`[${event.toolName}] completed (${event.durationMs}ms)`);
            const snippet = event.result.length > 200 ? event.result.slice(0, 200) + "..." : event.result;
            console.log(`\x1b[90m  Result: ${snippet.replace(/\n/g, "\n  ")}\x1b[0m\n`);
            break;
          }

          case "response:start":
            spinner.start("Generating response...");
            break;

          case "response:complete":
            spinner.stop();
            console.log(`\n\x1b[1m\x1b[32mAgent:\x1b[0m\n${event.content}\n`);
            break;

          case "done":
            activeSession.setHistory(event.history);
            break;

          case "error":
            spinner.fail(`Error (${event.phase}): ${event.message}`);
            console.log();
            break;
        }
      }
    } catch (err: any) {
      spinner.stop();
      console.log(`\x1b[31mExecution failed: ${err.message || String(err)}\x1b[0m\n`);
    }
  }
}

if (import.meta.main) {
  runCLI().catch((err) => {
    console.error("CLI crashed:", err);
  });
}
