import { $ } from "bun";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  OperationOutcome,
  Tool,
  ToolErrorType,
  ToolExecutionDetails,
  ToolParameterProperty,
  ToolResponse,
  ToolStatus,
} from "./types.ts";

/**
 * Standard factory helper to create deterministic ToolResponse JSON string payloads.
 */
export function createToolResponse<T = any>(params: {
  toolStatus?: ToolStatus;
  outcome: OperationOutcome;
  data?: T;
  execution?: ToolExecutionDetails;
  error?: {
    type: ToolErrorType;
    message: string;
    details?: string;
  };
  metadata?: Record<string, any>;
}): string {
  const payload: ToolResponse<T> = {
    toolStatus: params.toolStatus || (params.outcome === "tool_error" ? "tool_error" : "success"),
    outcome: params.outcome,
    ...(params.data !== undefined && { data: params.data }),
    ...(params.execution && { execution: params.execution }),
    ...(params.error && { error: params.error }),
    ...(params.metadata && { metadata: params.metadata }),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Resolves a raw target path to absolute path and normalized relative POSIX path.
 */
export function resolveToolPath(rawPath: string): { absPath: string; relPath: string } {
  const absPath = resolve(rawPath);
  const relPath = relative(process.cwd(), absPath).replace(/\\/g, "/") || rawPath;
  return { absPath, relPath };
}

export type FileTargetResult =
  | { ok: true; absPath: string; relPath: string; exists: boolean; isDirectory: boolean }
  | { ok: false; response: string };

/**
 * Validates a filesystem target for file-oriented tools (read, edit, delete).
 */
export function validateFileTarget(
  rawPath: string,
  options: {
    toolName: string;
    mustExist?: boolean;
    allowDirectory?: boolean;
  }
): FileTargetResult {
  const { absPath, relPath } = resolveToolPath(rawPath);
  const exists = existsSync(absPath);

  if (options.mustExist !== false && !exists) {
    return {
      ok: false,
      response: createToolResponse({
        toolStatus: "success",
        outcome: "not_found",
        data: { path: relPath },
        error: {
          type: "filesystem_error",
          message: `File '${relPath}' does not exist.`,
        },
      }),
    };
  }

  if (exists) {
    try {
      const stats = statSync(absPath);
      if (stats.isDirectory() && !options.allowDirectory) {
        const action = options.toolName === "edit" ? "edit" : options.toolName === "read" ? "read" : "operate on";
        return {
          ok: false,
          response: createToolResponse({
            toolStatus: "success",
            outcome: "invalid_target",
            data: {
              path: relPath,
              targetType: "directory",
            },
            error: {
              type: "filesystem_error",
              message: `'${relPath}' is a directory, not a file. The '${options.toolName}' tool can only ${action} files.`,
            },
          }),
        };
      }
      return {
        ok: true,
        absPath,
        relPath,
        exists: true,
        isDirectory: stats.isDirectory(),
      };
    } catch {
      // Fall through if stat fails
    }
  }

  return {
    ok: true,
    absPath,
    relPath,
    exists,
    isDirectory: false,
  };
}

export interface CreateToolOptions<TArgs extends Record<string, any> = Record<string, any>> {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
    requiredMessage?: (missingParam: string) => string;
  };
  execute: (
    args: TArgs
  ) => Promise<string | Parameters<typeof createToolResponse>[0]> | string | Parameters<typeof createToolResponse>[0];
}

/**
 * Universal Tool factory enforcing standard schemas, automatic parameter validation,
 * top-level exception wrapping, and response normalization.
 */
export function createTool<TArgs extends Record<string, any> = Record<string, any>>(
  def: CreateToolOptions<TArgs>
): Tool {
  return {
    name: def.name,
    description: def.description,
    parameters: {
      type: "object",
      properties: def.parameters.properties,
      required: def.parameters.required,
    },
    execute: async (rawArgs: Record<string, any>): Promise<string> => {
      // 1. Automatic required parameter checking
      if (def.parameters.required) {
        for (const req of def.parameters.required) {
          const val = rawArgs[req];
          if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
            const message = def.parameters.requiredMessage
              ? def.parameters.requiredMessage(req)
              : `'${req}' parameter is required for the ${def.name} tool.`;
            return createToolResponse({
              toolStatus: "tool_error",
              outcome: "tool_error",
              error: {
                type: "validation_error",
                message,
              },
            });
          }
        }
      }

      // 2. Safe execution with automatic error wrapping
      try {
        const res = await def.execute(rawArgs as TArgs);
        if (typeof res === "string") {
          return res;
        }
        return createToolResponse(res);
      } catch (err: any) {
        return createToolResponse({
          toolStatus: "tool_error",
          outcome: "tool_error",
          error: {
            type: "tool_invocation_error",
            message: `Error executing tool '${def.name}': ${err.message || String(err)}`,
          },
        });
      }
    },
  };
}

/**
 * Skill Discovery tool: Discover and inspect available skills and tools along with their YAML front-matter.
 * Supports inspecting a single skill or multiple skills simultaneously.
 */
export const skillDiscoveryTool = createTool({
  name: "skill_discovery",
  description:
    "Discover and inspect available skills and tools along with their YAML front-matter (name, description, parameters, and metadata). Supports inspecting a single skill or multiple skills simultaneously.",
  parameters: {
    properties: {
      skillNames: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Optional list of skill names to inspect multiple skills at once (e.g., ['react', 'vite', 'typescript']).",
      },
      skillName: {
        type: "string",
        description:
          "Optional skill name (or comma-separated skill names) to inspect (e.g., 'debugging', 'codebase_discovery', 'react'). If omitted and skillNames is omitted, lists the catalog of all available skills and tools.",
      },
    },
  },
  execute: async (args: Record<string, any>) => {
    const candidateDirs = [
      resolve("skills"),
      resolve(import.meta.dir, "../skills"),
      join(homedir(), ".zero/skills"),
    ];

    // Normalize requested skills from skillNames or skillName
    let requestedSkills: string[] = [];
    if (Array.isArray(args.skillNames)) {
      requestedSkills = args.skillNames.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    } else if (typeof args.skillNames === "string" && args.skillNames.trim()) {
      requestedSkills = args.skillNames.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (args.skillName && typeof args.skillName === "string" && args.skillName.trim()) {
      requestedSkills = args.skillName.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    }

    const isMultiFetch = Array.isArray(args.skillNames) || requestedSkills.length > 1;

    // Scan all available skill folders once
    const availableSkills: Array<{ folder: string; key: string; fullPath: string }> = [];
    const seen = new Set<string>();

    for (const dir of candidateDirs) {
      if (!existsSync(dir)) continue;
      try {
        const glob = new Bun.Glob("*/SKILL.md");
        for (const rel of glob.scanSync({ cwd: dir })) {
          const folder = dirname(rel);
          const key = folder.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            availableSkills.push({ folder, key, fullPath: join(dir, rel) });
          }
        }
      } catch {}
    }

    // Specific skill(s) requested
    if (requestedSkills.length > 0) {
      const skillDocs: Record<string, string> = {};
      for (const skill of availableSkills) {
        if (requestedSkills.includes(skill.key)) {
          try {
            skillDocs[skill.key] = await Bun.file(skill.fullPath).text();
          } catch {}
        }
      }

      if (!isMultiFetch && requestedSkills.length === 1) {
        const target = requestedSkills[0]!;
        if (skillDocs[target]) {
          return { outcome: "success", data: { skillName: target, documentation: skillDocs[target] } };
        }
        return {
          outcome: "not_found",
          data: { requestedSkill: target },
          error: { type: "validation_error", message: `Skill '${target}' was not found.` },
        };
      }

      const skillsResults = requestedSkills.map((name) => ({
        skillName: name,
        found: Boolean(skillDocs[name]),
        ...(skillDocs[name] ? { documentation: skillDocs[name] } : {}),
      }));

      const foundCount = skillsResults.filter((r) => r.found).length;
      const missing = skillsResults.filter((r) => !r.found).map((r) => r.skillName);

      if (foundCount === 0) {
        return {
          outcome: "not_found",
          data: { requestedSkills, skills: skillsResults },
          error: {
            type: "validation_error",
            message: `None of the requested skills (${requestedSkills.join(", ")}) were found.`,
          },
        };
      }

      return {
        outcome: "success",
        data: { requestedSkills, foundCount, missing, skills: skillsResults },
      };
    }

    // Catalog mode
    const toolsCatalog: Array<{ name: string; description: string; frontMatter: string }> = [];
    const skillsCatalog: Array<{ name: string; type: string; description: string; frontMatter: string }> = [];

    for (const skill of availableSkills) {
      try {
        const content = await Bun.file(skill.fullPath).text();
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (match && match[1]) {
          const frontMatter = match[1].trim();
          const isTool = frontMatter.includes("type: tool") || frontMatter.includes("parameters:");
          const descMatch = frontMatter.match(/description:\s*(.+)/);
          const description = descMatch && descMatch[1] ? descMatch[1].trim() : "";

          if (isTool) {
            toolsCatalog.push({ name: skill.folder, description, frontMatter });
          } else {
            const typeMatch = frontMatter.match(/type:\s*([a-zA-Z0-9_-]+)/);
            const skillType = typeMatch && typeMatch[1] ? typeMatch[1].trim() : "process_skill";
            skillsCatalog.push({ name: skill.folder, type: skillType, description, frontMatter });
          }
        }
      } catch {}
    }

    return {
      outcome: "success",
      data: { tools: toolsCatalog, skills: skillsCatalog },
      metadata: { totalTools: toolsCatalog.length, totalSkills: skillsCatalog.length },
    };
  },
});

/**
 * Resolves a native POSIX Bash/sh executable across Unix, Linux, macOS, and Windows.
 */
export function resolveBashExecutable(): string | null {
  if (process.platform !== "win32") {
    const unixPaths = ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/bin/sh", "/usr/bin/sh"];
    for (const p of unixPaths) {
      if (existsSync(p)) return p;
    }
    return "bash";
  }

  // Windows candidate locations for Git Bash / MSYS / Cygwin / WSL
  const localAppData = process.env.LOCALAPPDATA || "";
  const userProfile = process.env.USERPROFILE || "";
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const windowsPaths = [
    `${programFiles}\\Git\\bin\\bash.exe`,
    `${programFiles}\\Git\\usr\\bin\\bash.exe`,
    `${programFilesX86}\\Git\\bin\\bash.exe`,
    `${programFilesX86}\\Git\\usr\\bin\\bash.exe`,
    `${localAppData}\\Programs\\Git\\bin\\bash.exe`,
    `${localAppData}\\Programs\\Git\\usr\\bin\\bash.exe`,
    `${userProfile}\\scoop\\apps\\git\\current\\bin\\bash.exe`,
    "C:\\msys64\\usr\\bin\\bash.exe",
    "C:\\tools\\msys64\\usr\\bin\\bash.exe",
  ];

  for (const p of windowsPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

/**
 * Detects whether a shell command attempts to create or edit files on disk.
 * File creation and editing must be performed via the dedicated 'write' and 'edit' tools.
 */
export function isDisallowedBashFileWrite(command: string): { isDisallowed: boolean; reason?: string } {
  // 1. Check for file creation / inline editing tools
  if (/\btouch\s+/i.test(command)) {
    return {
      isDisallowed: true,
      reason: "Creating files via 'touch' in bash is prohibited. Use the 'write' tool to create files.",
    };
  }

  if (/\btee(\s+|$)/i.test(command)) {
    return {
      isDisallowed: true,
      reason: "Writing to files via 'tee' in bash is prohibited. Use the 'write' tool to create files or 'edit' to modify them.",
    };
  }

  if (/\bsed\s+-[a-zA-Z]*i/i.test(command)) {
    return {
      isDisallowed: true,
      reason: "In-place file editing via 'sed -i' in bash is prohibited. Use the 'edit' tool to modify files.",
    };
  }

  if (/cat\s+<<\s*['"]?([A-Za-z0-9_-]+)['"]?/i.test(command)) {
    return {
      isDisallowed: true,
      reason: "Writing file contents via heredocs ('cat << EOF') in bash is prohibited. Use the 'write' tool instead.",
    };
  }

  if (/\b(fs\.(writeFile|writeFileSync|appendFile|appendFileSync)|Bun\.write)\b/i.test(command)) {
    return {
      isDisallowed: true,
      reason: "Creating or modifying files via inline node/bun scripts in bash is prohibited. Use the 'write' or 'edit' tool instead.",
    };
  }

  // 2. Check for output redirections (> or >>) to files
  const redirectMatches = command.matchAll(/(?<![=-])(?:>{1,2})\s*([^\s;&|]+)/g);
  for (const match of redirectMatches) {
    const target = (match[1] || "").toLowerCase().trim();
    if (
      target === "/dev/null" ||
      target === "nul" ||
      target === "&1" ||
      target === "&2" ||
      target.startsWith("&")
    ) {
      continue;
    }
    return {
      isDisallowed: true,
      reason: `Redirecting output to a file ('${match[0]}') in bash is prohibited. Use the 'write' tool to create or overwrite files, or the 'edit' tool to modify files.`,
    };
  }

  return { isDisallowed: false };
}

interface ExecutionResult {
  timedOut: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function formatExecutionResponse(
  rawCommand: string,
  res: ExecutionResult,
  durationMs: number,
  timeout: number
) {
  const execution: ToolExecutionDetails = {
    command: rawCommand,
    exitCode: res.exitCode,
    stdout: res.stdout.trimEnd(),
    stderr: res.stderr.trimEnd(),
    durationMs,
    timedOut: res.timedOut,
  };

  if (res.timedOut) {
    execution.stderr = `Command '${rawCommand}' timed out after ${timeout}ms.`;
    return {
      toolStatus: "success" as const,
      outcome: "timeout" as const,
      execution,
      error: {
        type: "command_execution_error" as const,
        message: `Command '${rawCommand}' timed out after ${timeout}ms.`,
      },
    };
  }

  if (res.exitCode !== 0) {
    return {
      toolStatus: "success" as const,
      outcome: "failure" as const,
      execution,
      error: {
        type: "command_execution_error" as const,
        message: `Command '${rawCommand}' exited with code ${res.exitCode}.`,
      },
    };
  }

  return { toolStatus: "success" as const, outcome: "success" as const, execution };
}

/**
 * Bash tool: Execute shell commands sandboxed to the project workspace directory.
 * Fully OS-agnostic: executes with full POSIX Bash semantics across Windows, macOS, and Linux.
 */
export const bashTool = createTool({
  name: "bash",
  description:
    "Execute a shell command sandboxed within the project workspace (e.g. 'bun test', 'npm run build', 'tsc', 'git status'). OS-agnostic: resolves POSIX Bash syntax across Windows, Linux, and macOS. Creating or modifying files via bash is prohibited (use 'write' or 'edit' instead).",
  parameters: {
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
      timeoutMs: {
        type: "number",
        description: "Optional execution timeout in milliseconds (defaults to 30000ms).",
      },
    },
    required: ["command"],
  },
  execute: async (args: { command: string; timeoutMs?: number }) => {
    const rawCommand = String(args.command || "").trim();
    const check = isDisallowedBashFileWrite(rawCommand);
    if (check.isDisallowed) {
      return {
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message:
            check.reason ||
            "File creation and editing via the bash tool is prohibited. Use the 'write' tool to create files and the 'edit' tool to modify files.",
        },
      };
    }

    const timeout = typeof args.timeoutMs === "number" && args.timeoutMs > 0 ? args.timeoutMs : 30000;
    const workspaceRoot = process.cwd();
    const startTime = Date.now();
    const bashExe = resolveBashExecutable();

    let timer: any;
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeout);
    });

    let execResult: ExecutionResult;

    if (bashExe) {
      const proc = Bun.spawn([bashExe, "-c", rawCommand], {
        cwd: workspaceRoot,
        env: { ...process.env },
        stdout: "pipe",
        stderr: "pipe",
      });

      const outcome = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]).then(([stdout, stderr, exitCode]) => ({ timedOut: false as const, stdout, stderr, exitCode })),
        timeoutPromise,
      ]);

      if (outcome.timedOut) {
        try {
          proc.kill();
          if (process.platform === "win32" && proc.pid) {
            Bun.spawn(["taskkill", "/F", "/T", "/PID", String(proc.pid)], { stdout: "ignore", stderr: "ignore" });
          }
        } catch {}
        execResult = { timedOut: true, exitCode: null, stdout: "", stderr: "" };
      } else {
        execResult = outcome;
      }
    } else {
      const outcome = await Promise.race([
        $`${{ raw: rawCommand }}`.cwd(workspaceRoot).env({ ...process.env }).quiet().nothrow().then((res) => ({
          timedOut: false as const,
          stdout: res.stdout.toString(),
          stderr: res.stderr.toString(),
          exitCode: res.exitCode,
        })),
        timeoutPromise,
      ]);

      execResult = outcome.timedOut
        ? { timedOut: true, exitCode: null, stdout: "", stderr: "" }
        : outcome;
    }

    clearTimeout(timer);
    return formatExecutionResponse(rawCommand, execResult, Date.now() - startTime, timeout);
  },
});

/**
 * Glob tool: Find files matching a glob pattern.
 */
export const globTool = createTool({
  name: "glob",
  description: "Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*', '*.json').",
  parameters: {
    properties: {
      pattern: {
        type: "string",
        description: "The glob pattern to search for (e.g., '**/*.ts', 'src/*', '*.json').",
      },
      path: {
        type: "string",
        description: "Base directory to search within (defaults to current working directory '.').",
      },
    },
    required: ["pattern"],
  },
  execute: async (args: { pattern: string; path?: string }) => {
    const pattern = String(args.pattern || "*.*");
    const { absPath, relPath } = resolveToolPath(args.path || ".");

    if (!existsSync(absPath)) {
      return {
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: relPath,
          pattern,
        },
        error: {
          type: "filesystem_error",
          message: `Directory '${relPath}' does not exist.`,
        },
      };
    }

    const stats = statSync(absPath);
    if (stats.isFile()) {
      return {
        toolStatus: "success",
        outcome: "invalid_target",
        data: {
          path: relPath,
          targetType: "file",
        },
        error: {
          type: "filesystem_error",
          message: `Path '${relPath}' is a file, not a directory.`,
        },
      };
    }

    const glob = new Bun.Glob(pattern);
    const matches: string[] = [];

    for (const file of glob.scanSync({ cwd: absPath, onlyFiles: false })) {
      matches.push(file.replace(/\\/g, "/"));
      if (matches.length >= 200) {
        matches.push("... (results capped at 200 matches)");
        break;
      }
    }

    // 0 matches in an existing directory is a valid empty query result (success), not an error
    return {
      toolStatus: "success",
      outcome: "success",
      data: {
        path: relPath,
        pattern,
        matches,
        count: matches.length,
      },
    };
  },
});

/**
 * Grep tool: Search text or regex across codebase files.
 */
export const grepTool = createTool({
  name: "grep",
  description: "Search for a regex or text pattern across files with line numbers and snippets.",
  parameters: {
    properties: {
      pattern: {
        type: "string",
        description: "Regular expression or text pattern to search for.",
      },
      path: {
        type: "string",
        description: "Directory or file to search in (defaults to '.').",
      },
      include: {
        type: "string",
        description: "Optional file glob filter to narrow search (e.g. '*.ts', '*.json').",
      },
      caseSensitive: {
        type: "boolean",
        description: "Whether the search is case-sensitive (defaults to false).",
      },
    },
    required: ["pattern"],
    requiredMessage: (param) => `'${param}' parameter is required for grep.`,
  },
  execute: async (args: { pattern: string; path?: string; include?: string; caseSensitive?: boolean }) => {
    const pattern = String(args.pattern || "");
    const { absPath, relPath } = resolveToolPath(args.path || ".");
    const includePattern = args.include ? String(args.include) : null;
    const caseSensitive = Boolean(args.caseSensitive);

    if (!existsSync(absPath)) {
      return {
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: relPath,
          pattern,
        },
        error: {
          type: "filesystem_error",
          message: `Path '${relPath}' does not exist.`,
        },
      };
    }

    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(pattern, flags);
    const matches: Array<{ file: string; line: number; content: string }> = [];

    const stats = statSync(absPath);
    const filesToSearch: string[] = [];

    if (stats.isFile()) {
      filesToSearch.push(absPath);
    } else {
      const globFilter = includePattern ? includePattern : "**/*";
      const glob = new Bun.Glob(globFilter);
      for (const relFile of glob.scanSync({ cwd: absPath, onlyFiles: true })) {
        if (relFile.includes("node_modules") || relFile.includes(".git")) {
          continue;
        }
        filesToSearch.push(join(absPath, relFile));
      }
    }

    for (const fullPath of filesToSearch) {
      if (matches.length >= 100) break;

      try {
        const content = await Bun.file(fullPath).text();
        const lines = content.split(/\r?\n/);
        const matchRel = relative(process.cwd(), fullPath).replace(/\\/g, "/");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          regex.lastIndex = 0;
          if (regex.test(line)) {
            matches.push({
              file: matchRel,
              line: i + 1,
              content: line.trimEnd(),
            });
            if (matches.length >= 100) break;
          }
        }
      } catch {
        // Ignore unreadable or binary files
      }
    }

    // 0 matches is a valid search result (success), not an error
    return {
      toolStatus: "success",
      outcome: "success",
      data: {
        path: relPath,
        pattern,
        matches,
        count: matches.length,
      },
    };
  },
});

/**
 * Read tool: Read file content with line numbers and optional line slicing.
 */
export const readTool = createTool({
  name: "read",
  description: "Read content of a file with line numbers, optionally specifying start and end lines.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "Path to the file to read.",
      },
      startLine: {
        type: "number",
        description: "1-indexed starting line number (optional).",
      },
      endLine: {
        type: "number",
        description: "1-indexed ending line number (inclusive, optional).",
      },
    },
    required: ["path"],
  },
  execute: async (args: { path: string; startLine?: number; endLine?: number }) => {
    const target = validateFileTarget(args.path, { toolName: "read" });
    if (!target.ok) return target.response;

    const content = await Bun.file(target.absPath).text();
    const lines = content.split(/\r?\n/);

    if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
      return {
        toolStatus: "success",
        outcome: "success",
        data: {
          path: target.relPath,
          content: "[File is empty (0 lines)]",
          startLine: 1,
          endLine: 0,
          totalLines: 0,
        },
      };
    }

    const start = args.startLine ? Math.max(1, Math.floor(Number(args.startLine))) : 1;
    const end = args.endLine ? Math.min(lines.length, Math.floor(Number(args.endLine))) : lines.length;

    if (start > lines.length) {
      return {
        toolStatus: "success",
        outcome: "mismatch",
        data: {
          path: target.relPath,
          totalLines: lines.length,
          requestedStartLine: start,
        },
        error: {
          type: "validation_error",
          message: `startLine ${start} exceeds total lines (${lines.length}) in '${target.relPath}'.`,
        },
      };
    }

    const formattedLines: string[] = [];
    for (let i = start; i <= end; i++) {
      const lineNum = String(i).padStart(4, " ");
      formattedLines.push(`${lineNum} | ${lines[i - 1]}`);
    }

    return {
      toolStatus: "success",
      outcome: "success",
      data: {
        path: target.relPath,
        content: formattedLines.join("\n"),
        startLine: start,
        endLine: end,
        totalLines: lines.length,
      },
    };
  },
});

/**
 * Write tool: Create or overwrite a file.
 */
export const writeTool = createTool({
  name: "write",
  description:
    "Create or completely overwrite a file with specified content. Creates directories automatically.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "Path to the file to write.",
      },
      content: {
        type: "string",
        description: "The full content to write to the file.",
      },
    },
    required: ["path", "content"],
  },
  execute: async (args: { path: string; content: string }) => {
    const { absPath, relPath } = resolveToolPath(args.path);
    const content = String(args.content ?? "");

    if (existsSync(absPath)) {
      const stats = statSync(absPath);
      if (stats.isDirectory()) {
        return {
          toolStatus: "success",
          outcome: "invalid_target",
          data: {
            path: relPath,
            targetType: "directory",
          },
          error: {
            type: "filesystem_error",
            message: `Cannot write to '${relPath}' because it is an existing directory.`,
          },
        };
      }
    }

    const dir = dirname(absPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const bytes = await Bun.write(absPath, content);
    return {
      toolStatus: "success",
      outcome: "success",
      data: {
        path: relPath,
        bytesWritten: bytes,
      },
    };
  },
});

/**
 * Edit tool: Perform targeted substring replacements in an existing file.
 * Supports single or multi-section editing within a single file.
 */
export const editTool = createTool({
  name: "edit",
  description:
    "Perform one or more targeted replacements within a single file. Supports multiple edits across different sections of the file at once. Each edit's oldString is matched against the original file independently (not incrementally). Do not include overlapping or nested edits; if two edits overlap, merge them together into one edit. Do not include large unchanged regions just to connect distant changes—use multiple separate edit blocks in 'edits' instead.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "Path to the file to edit.",
      },
      edits: {
        type: "array",
        description:
          "List of one or more targeted replacements ({ oldString, newString }) to apply across different sections of the file.",
        items: {
          type: "object",
          properties: {
            oldString: {
              type: "string",
              description: "The exact substring to replace in the original file.",
            },
            newString: {
              type: "string",
              description: "The replacement content.",
            },
          },
          required: ["oldString", "newString"],
        },
      },
      oldString: {
        type: "string",
        description: "The exact substring to replace (shorthand for single edit).",
      },
      newString: {
        type: "string",
        description: "The replacement content (shorthand for single edit).",
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, any>) => {
    // Normalize edits list from edits or oldString/newString
    let editList: Array<{ oldString: string; newString: string }> = [];
    if (Array.isArray(args.edits) && args.edits.length > 0) {
      editList = args.edits.map((e: any) => ({
        oldString: String(e.oldString ?? ""),
        newString: String(e.newString ?? ""),
      }));
    } else if (typeof args.oldString === "string") {
      editList = [
        {
          oldString: String(args.oldString ?? ""),
          newString: String(args.newString ?? ""),
        },
      ];
    }

    if (editList.length === 0) {
      return {
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "At least one edit ('edits' array or 'oldString'/'newString') must be provided for the edit tool.",
        },
      };
    }

    for (let i = 0; i < editList.length; i++) {
      if (!editList[i]!.oldString) {
        return {
          toolStatus: "tool_error",
          outcome: "tool_error",
          error: {
            type: "validation_error",
            message: `Edit #${i + 1} 'oldString' cannot be empty.`,
          },
        };
      }
    }

    const target = validateFileTarget(args.path, { toolName: "edit" });
    if (!target.ok) return target.response;

    const content = await Bun.file(target.absPath).text();
    const matchedEdits: Array<{
      index: number;
      oldString: string;
      newString: string;
      startIndex: number;
      endIndex: number;
    }> = [];

    // Step 1: Match every edit against the original file content
    for (let i = 0; i < editList.length; i++) {
      const { oldString, newString } = editList[i]!;

      if (!content.includes(oldString)) {
        return {
          toolStatus: "success",
          outcome: "mismatch",
          data: {
            path: target.relPath,
            editIndex: i,
            failedOldString: oldString,
            occurrences: 0,
          },
          error: {
            type: "filesystem_error",
            message: `Edit #${i + 1} oldString was not found in '${target.relPath}'.`,
          },
        };
      }

      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return {
          toolStatus: "success",
          outcome: "mismatch",
          data: {
            path: target.relPath,
            editIndex: i,
            failedOldString: oldString,
            occurrences,
          },
          error: {
            type: "filesystem_error",
            message: `Edit #${i + 1} oldString matched ${occurrences} occurrences in '${target.relPath}'. Provide more surrounding lines to make it unique.`,
          },
        };
      }

      const startIndex = content.indexOf(oldString);
      matchedEdits.push({
        index: i,
        oldString,
        newString,
        startIndex,
        endIndex: startIndex + oldString.length,
      });
    }

    // Step 2: Check for overlapping or nested edits
    const sortedEdits = [...matchedEdits].sort((a, b) => a.startIndex - b.startIndex);
    for (let j = 1; j < sortedEdits.length; j++) {
      const prev = sortedEdits[j - 1]!;
      const curr = sortedEdits[j]!;
      if (curr.startIndex < prev.endIndex) {
        return {
          toolStatus: "success",
          outcome: "mismatch",
          data: {
            path: target.relPath,
            overlappingEdits: [
              { editIndex: prev.index, oldString: prev.oldString, range: [prev.startIndex, prev.endIndex] },
              { editIndex: curr.index, oldString: curr.oldString, range: [curr.startIndex, curr.endIndex] },
            ],
          },
          error: {
            type: "validation_error",
            message: `Edits #${prev.index + 1} and #${curr.index + 1} overlap or are nested in '${target.relPath}'. Overlapping edits must be merged together into a single edit block.`,
          },
        };
      }
    }

    // Step 3: Apply replacements simultaneously from the original content
    let updatedContent = "";
    let lastIndex = 0;
    for (const edit of sortedEdits) {
      updatedContent += content.slice(lastIndex, edit.startIndex);
      updatedContent += edit.newString;
      lastIndex = edit.endIndex;
    }
    updatedContent += content.slice(lastIndex);

    await Bun.write(target.absPath, updatedContent);

    return {
      toolStatus: "success",
      outcome: "success",
      data: {
        path: target.relPath,
        editsApplied: editList.length,
        message: `Successfully applied ${editList.length} edit${editList.length > 1 ? "s" : ""} to '${target.relPath}'.`,
      },
    };
  },
});

/**
 * Delete tool: Delete a file or directory on the filesystem.
 */
export const deleteTool = createTool({
  name: "delete",
  description:
    "Delete a file or directory on the filesystem. Supports deleting single files or directories recursively.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "Path to the file or directory to delete.",
      },
      recursive: {
        type: "boolean",
        description: "Whether to recursively delete directories (defaults to false for directories).",
      },
    },
    required: ["path"],
  },
  execute: async (args: { path: string; recursive?: boolean }) => {
    const { absPath: targetPath, relPath } = resolveToolPath(args.path);
    const workspaceRoot = process.cwd();

    // Safety checks: Prevent deleting root filesystem or the workspace root directory itself
    if (targetPath === resolve("/") || targetPath === workspaceRoot || relPath === "." || relPath === "") {
      return {
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "Deleting the workspace root directory or system root is prohibited.",
        },
      };
    }

    if (!existsSync(targetPath)) {
      return {
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: relPath,
        },
        error: {
          type: "filesystem_error",
          message: `Path '${relPath}' does not exist.`,
        },
      };
    }

    const stats = statSync(targetPath);
    const isDir = stats.isDirectory();
    const recursive = Boolean(args.recursive);

    if (isDir) {
      if (!recursive) {
        return {
          toolStatus: "success",
          outcome: "invalid_target",
          data: {
            path: relPath,
            targetType: "directory",
          },
          error: {
            type: "validation_error",
            message: `'${relPath}' is a directory. Set 'recursive: true' to delete a directory.`,
          },
        };
      }
      rmSync(targetPath, { recursive: true, force: true });
      return {
        toolStatus: "success",
        outcome: "success",
        data: {
          path: relPath,
          targetType: "directory",
          message: `Successfully deleted directory '${relPath}'.`,
        },
      };
    }

    // Single file deletion
    rmSync(targetPath, { force: true });
    return {
      toolStatus: "success",
      outcome: "success",
      data: {
        path: relPath,
        targetType: "file",
        message: `Successfully deleted file '${relPath}'.`,
      },
    };
  },
});

/**
 * Default coding & skill tools collection.
 */
export const defaultTools: Tool[] = [
  skillDiscoveryTool,
  bashTool,
  globTool,
  grepTool,
  readTool,
  writeTool,
  editTool,
  deleteTool,
];

/**
 * Tool Registry for managing and converting tools to OpenAI format.
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor(initialTools: Tool[] = defaultTools) {
    for (const tool of initialTools) {
      this.register(tool);
    }
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  toOpenAITools(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return this.getAll().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(name: string, args: Record<string, any>): Promise<string> {
    const tool = this.get(name);
    if (!tool) {
      const knownSkills = [
        "execute",
        "codebase_discovery",
        "debugging",
        "validation_of_work",
        "react",
        "vite",
        "typescript",
      ];

      if (knownSkills.includes(name.toLowerCase())) {
        return createToolResponse({
          toolStatus: "tool_error",
          outcome: "tool_error",
          data: {
            attemptedName: name,
            type: "process_skill",
          },
          error: {
            type: "tool_invocation_error",
            message: `'${name}' is a process/domain skill, NOT a callable tool. To inspect '${name}' guidelines, call skill_discovery({ skillName: "${name}" }).`,
          },
        });
      }

      const availableNames = Array.from(this.tools.keys()).join(", ");
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        data: {
          attemptedName: name,
        },
        error: {
          type: "tool_invocation_error",
          message: `Tool '${name}' is not recognized. Available tools: ${availableNames}.`,
        },
      });
    }

    try {
      return await tool.execute(args);
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message: `Error executing tool '${name}': ${err.message || String(err)}`,
        },
      });
    }
  }
}
