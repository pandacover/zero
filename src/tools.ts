import { $ } from "bun";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  OperationOutcome,
  Tool,
  ToolErrorType,
  ToolExecutionDetails,
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
 * Skill Discovery tool: Discover and inspect available skills and tools along with their YAML front-matter.
 * Supports inspecting a single skill or multiple skills simultaneously.
 */
export const skillDiscoveryTool: Tool = {
  name: "skill_discovery",
  description:
    "Discover and inspect available skills and tools along with their YAML front-matter (name, description, parameters, and metadata). Supports inspecting a single skill or multiple skills simultaneously.",
  parameters: {
    type: "object",
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
  execute: async (args: Record<string, any>): Promise<string> => {
    const candidateDirs = [
      resolve("skills"), // Current workspace skills
      resolve(import.meta.dir, "../skills"), // Built-in repository skills
      join(homedir(), ".zero/skills"), // Global user skills
    ];

    // Normalize requested skills from skillNames or skillName
    let requestedSkills: string[] = [];
    if (Array.isArray(args.skillNames)) {
      requestedSkills = args.skillNames
        .map((s) => String(s).trim().toLowerCase())
        .filter(Boolean);
    } else if (typeof args.skillNames === "string" && args.skillNames.trim()) {
      requestedSkills = args.skillNames
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (args.skillName && typeof args.skillName === "string" && args.skillName.trim()) {
      requestedSkills = args.skillName
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }

    const isMultiFetch = Array.isArray(args.skillNames) || requestedSkills.length > 1;

    // Fast-path: When specific skill(s) are requested
    if (requestedSkills.length > 0) {
      const requestedSkillSet = new Set(requestedSkills);
      const skillDocs: Record<string, string> = {};

      for (const skillsDir of candidateDirs) {
        if (!existsSync(skillsDir)) continue;

        try {
          const glob = new Bun.Glob("*/SKILL.md");
          for (const relFile of glob.scanSync({ cwd: skillsDir })) {
            const fullPath = join(skillsDir, relFile);
            const skillFolder = dirname(relFile);
            const skillKey = skillFolder.toLowerCase();

            if (requestedSkillSet.has(skillKey) && !skillDocs[skillKey]) {
              try {
                skillDocs[skillKey] = await Bun.file(fullPath).text();
              } catch {
                // Ignore
              }
            }
          }
        } catch {
          // Ignore
        }
      }

      // If single skill requested and not in multi-fetch mode
      if (!isMultiFetch && requestedSkills.length === 1) {
        const target = requestedSkills[0]!;
        if (skillDocs[target]) {
          return createToolResponse({
            outcome: "success",
            data: {
              skillName: target,
              documentation: skillDocs[target],
            },
          });
        }
        return createToolResponse({
          outcome: "not_found",
          data: { requestedSkill: target },
          error: {
            type: "validation_error",
            message: `Skill '${target}' was not found.`,
          },
        });
      }

      // Multi-fetch response format
      const skillsResults = requestedSkills.map((name) => {
        if (skillDocs[name]) {
          return {
            skillName: name,
            found: true,
            documentation: skillDocs[name],
          };
        }
        return {
          skillName: name,
          found: false,
        };
      });

      const foundCount = skillsResults.filter((r) => r.found).length;
      const missing = skillsResults.filter((r) => !r.found).map((r) => r.skillName);

      if (foundCount === 0) {
        return createToolResponse({
          outcome: "not_found",
          data: {
            requestedSkills,
            skills: skillsResults,
          },
          error: {
            type: "validation_error",
            message: `None of the requested skills (${requestedSkills.join(", ")}) were found.`,
          },
        });
      }

      return createToolResponse({
        outcome: "success",
        data: {
          requestedSkills,
          foundCount,
          missing,
          skills: skillsResults,
        },
      });
    }

    // Default: Return catalog of all tools & skills
    const seenSkills = new Set<string>();
    const toolsCatalog: Array<{ name: string; description: string; frontMatter: string }> = [];
    const skillsCatalog: Array<{ name: string; type: string; description: string; frontMatter: string }> = [];

    for (const skillsDir of candidateDirs) {
      if (!existsSync(skillsDir)) continue;

      try {
        const glob = new Bun.Glob("*/SKILL.md");
        for (const relFile of glob.scanSync({ cwd: skillsDir })) {
          const fullPath = join(skillsDir, relFile);
          const skillFolder = dirname(relFile);
          const skillKey = skillFolder.toLowerCase();

          if (seenSkills.has(skillKey)) continue;

          try {
            const content = await Bun.file(fullPath).text();
            const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (match && match[1]) {
              seenSkills.add(skillKey);
              const frontMatter = match[1].trim();
              const isTool = frontMatter.includes("type: tool") || frontMatter.includes("parameters:");
              const descMatch = frontMatter.match(/description:\s*(.+)/);
              const description = descMatch && descMatch[1] ? descMatch[1].trim() : "";

              if (isTool) {
                toolsCatalog.push({
                  name: skillFolder,
                  description,
                  frontMatter,
                });
              } else {
                const typeMatch = frontMatter.match(/type:\s*([a-zA-Z0-9_-]+)/);
                const skillType = typeMatch && typeMatch[1] ? typeMatch[1].trim() : "process_skill";
                skillsCatalog.push({
                  name: skillFolder,
                  type: skillType,
                  description,
                  frontMatter,
                });
              }
            }
          } catch {
            // Ignore unreadable skill files
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }

    return createToolResponse({
      outcome: "success",
      data: {
        tools: toolsCatalog,
        skills: skillsCatalog,
      },
      metadata: {
        totalTools: toolsCatalog.length,
        totalSkills: skillsCatalog.length,
      },
    });
  },
};

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

/**
 * Bash tool: Execute shell commands sandboxed to the project workspace directory.
 * Fully OS-agnostic: executes with full POSIX Bash semantics across Windows, macOS, and Linux.
 */
export const bashTool: Tool = {
  name: "bash",
  description:
    "Execute a shell command sandboxed within the project workspace (e.g. 'bun test', 'npm run build', 'tsc', 'git status'). OS-agnostic: resolves POSIX Bash syntax across Windows, Linux, and macOS. Creating or modifying files via bash is prohibited (use 'write' or 'edit' instead).",
  parameters: {
    type: "object",
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
  execute: async (args: Record<string, any>): Promise<string> => {
    const rawCommand = String(args.command || "").trim();
    if (!rawCommand) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "'command' parameter is required for the bash tool.",
        },
      });
    }

    const check = isDisallowedBashFileWrite(rawCommand);
    if (check.isDisallowed) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message: check.reason || "File creation and editing via the bash tool is prohibited. Use the 'write' tool to create files and the 'edit' tool to modify files.",
        },
      });
    }

    const timeout = typeof args.timeoutMs === "number" && args.timeoutMs > 0 ? args.timeoutMs : 30000;
    const workspaceRoot = process.cwd();
    const startTime = Date.now();

    try {
      const bashExe = resolveBashExecutable();

      if (bashExe) {
        // Execute via native POSIX Bash binary
        const proc = Bun.spawn([bashExe, "-c", rawCommand], {
          cwd: workspaceRoot,
          env: { ...process.env },
          stdout: "pipe",
          stderr: "pipe",
        });

        let timedOut = false;
        const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
          setTimeout(() => {
            timedOut = true;
            try {
              proc.kill();
              if (process.platform === "win32" && proc.pid) {
                Bun.spawn(["taskkill", "/F", "/T", "/PID", String(proc.pid)], {
                  stdout: "ignore",
                  stderr: "ignore",
                });
              }
            } catch {
              // Ignore
            }
            resolve({ timedOut: true });
          }, timeout);
        });

        const execPromise = Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]).then(([stdout, stderr, exitCode]) => ({
          timedOut: false as const,
          stdout,
          stderr,
          exitCode,
        }));

        const result = await Promise.race([execPromise, timeoutPromise]);
        const durationMs = Date.now() - startTime;

        if (result.timedOut) {
          const execution: ToolExecutionDetails = {
            command: rawCommand,
            exitCode: null,
            stdout: "",
            stderr: `Command '${rawCommand}' timed out after ${timeout}ms.`,
            durationMs,
            timedOut: true,
          };
          return createToolResponse({
            toolStatus: "success",
            outcome: "timeout",
            execution,
            error: {
              type: "command_execution_error",
              message: `Command '${rawCommand}' timed out after ${timeout}ms.`,
            },
          });
        }

        const exitCode = result.exitCode;
        const stdoutText = result.stdout.trimEnd();
        const stderrText = result.stderr.trimEnd();

        const execution: ToolExecutionDetails = {
          command: rawCommand,
          exitCode,
          stdout: stdoutText,
          stderr: stderrText,
          durationMs,
          timedOut: false,
        };

        if (exitCode !== 0) {
          return createToolResponse({
            toolStatus: "success",
            outcome: "failure",
            execution,
            error: {
              type: "command_execution_error",
              message: `Command '${rawCommand}' exited with code ${exitCode}.`,
            },
          });
        }

        return createToolResponse({
          toolStatus: "success",
          outcome: "success",
          execution,
        });
      }

      // Fallback: Cross-platform POSIX engine via Bun Shell
      const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
        setTimeout(() => resolve({ timedOut: true }), timeout)
      );

      const execPromise = $`${{ raw: rawCommand }}`
        .cwd(workspaceRoot)
        .env({ ...process.env })
        .quiet()
        .nothrow()
        .then((res) => ({
          timedOut: false as const,
          res,
        }));

      const result = await Promise.race([execPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      if (result.timedOut) {
        const execution: ToolExecutionDetails = {
          command: rawCommand,
          exitCode: null,
          stdout: "",
          stderr: `Command '${rawCommand}' timed out after ${timeout}ms.`,
          durationMs,
          timedOut: true,
        };
        return createToolResponse({
          toolStatus: "success",
          outcome: "timeout",
          execution,
          error: {
            type: "command_execution_error",
            message: `Command '${rawCommand}' timed out after ${timeout}ms.`,
          },
        });
      }

      const { res } = result;
      const execution: ToolExecutionDetails = {
        command: rawCommand,
        exitCode: res.exitCode,
        stdout: res.stdout.toString().trimEnd(),
        stderr: res.stderr.toString().trimEnd(),
        durationMs,
        timedOut: false,
      };

      if (res.exitCode !== 0) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "failure",
          execution,
          error: {
            type: "command_execution_error",
            message: `Command '${rawCommand}' exited with code ${res.exitCode}.`,
          },
        });
      }

      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        execution,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message: `Error executing command '${rawCommand}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

/**
 * Glob tool: Find files matching a glob pattern.
 */
export const globTool: Tool = {
  name: "glob",
  description: "Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*', '*.json').",
  parameters: {
    type: "object",
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
  execute: async (args: Record<string, any>): Promise<string> => {
    const pattern = String(args.pattern || "*.*");
    const targetPath = resolve(String(args.path || "."));

    if (!existsSync(targetPath)) {
      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
      return createToolResponse({
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: rel,
          pattern,
        },
        error: {
          type: "filesystem_error",
          message: `Directory '${rel}' does not exist.`,
        },
      });
    }

    try {
      const stats = statSync(targetPath);
      if (stats.isFile()) {
        const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || targetPath;
        return createToolResponse({
          toolStatus: "success",
          outcome: "invalid_target",
          data: {
            path: rel,
            targetType: "file",
          },
          error: {
            type: "filesystem_error",
            message: `Path '${rel}' is a file, not a directory.`,
          },
        });
      }

      const glob = new Bun.Glob(pattern);
      const matches: string[] = [];

      for (const file of glob.scanSync({ cwd: targetPath, onlyFiles: false })) {
        matches.push(file.replace(/\\/g, "/"));
        if (matches.length >= 200) {
          matches.push("... (results capped at 200 matches)");
          break;
        }
      }

      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";

      // 0 matches in an existing directory is a valid empty query result (success), not an error
      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        data: {
          path: rel,
          pattern,
          matches,
          count: matches.length,
        },
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message: `Error scanning glob '${pattern}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

/**
 * Grep tool: Search text or regex across codebase files.
 */
export const grepTool: Tool = {
  name: "grep",
  description: "Search for a regex or text pattern across files with line numbers and snippets.",
  parameters: {
    type: "object",
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
  },
  execute: async (args: Record<string, any>): Promise<string> => {
    const pattern = String(args.pattern || "");
    const targetPath = resolve(String(args.path || "."));
    const includePattern = args.include ? String(args.include) : null;
    const caseSensitive = Boolean(args.caseSensitive);

    if (!pattern) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "'pattern' parameter is required for grep.",
        },
      });
    }

    if (!existsSync(targetPath)) {
      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
      return createToolResponse({
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: rel,
          pattern,
        },
        error: {
          type: "filesystem_error",
          message: `Path '${rel}' does not exist.`,
        },
      });
    }

    try {
      const flags = caseSensitive ? "g" : "gi";
      const regex = new RegExp(pattern, flags);
      const matches: Array<{ file: string; line: number; content: string }> = [];

      const stats = statSync(targetPath);
      const filesToSearch: string[] = [];

      if (stats.isFile()) {
        filesToSearch.push(targetPath);
      } else {
        const globFilter = includePattern ? includePattern : "**/*";
        const glob = new Bun.Glob(globFilter);
        for (const relFile of glob.scanSync({ cwd: targetPath, onlyFiles: true })) {
          if (relFile.includes("node_modules") || relFile.includes(".git")) {
            continue;
          }
          filesToSearch.push(join(targetPath, relFile));
        }
      }

      for (const fullPath of filesToSearch) {
        if (matches.length >= 100) break;

        try {
          const content = await Bun.file(fullPath).text();
          const lines = content.split(/\r?\n/);
          const relPath = relative(process.cwd(), fullPath).replace(/\\/g, "/");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            regex.lastIndex = 0;
            if (regex.test(line)) {
              matches.push({
                file: relPath,
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

      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";

      // 0 matches is a valid search result (success), not an error
      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        data: {
          path: rel,
          pattern,
          matches,
          count: matches.length,
        },
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message: `Error in grep '${pattern}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

/**
 * Read tool: Read file content with line numbers and optional line slicing.
 */
export const readTool: Tool = {
  name: "read",
  description: "Read content of a file with line numbers, optionally specifying start and end lines.",
  parameters: {
    type: "object",
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
  execute: async (args: Record<string, any>): Promise<string> => {
    const rawPath = String(args.path || "").trim();
    if (!rawPath) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "'path' parameter is required for the read tool.",
        },
      });
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;

    if (!existsSync(filePath)) {
      return createToolResponse({
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: relPath,
        },
        error: {
          type: "filesystem_error",
          message: `File '${relPath}' does not exist.`,
        },
      });
    }

    try {
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "invalid_target",
          data: {
            path: relPath,
            targetType: "directory",
          },
          error: {
            type: "filesystem_error",
            message: `'${relPath}' is a directory, not a file. The 'read' tool can only read files.`,
          },
        });
      }

      const content = await Bun.file(filePath).text();
      const lines = content.split(/\r?\n/);

      if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "success",
          data: {
            path: relPath,
            content: "[File is empty (0 lines)]",
            startLine: 1,
            endLine: 0,
            totalLines: 0,
          },
        });
      }

      const start = args.startLine ? Math.max(1, Math.floor(Number(args.startLine))) : 1;
      const end = args.endLine ? Math.min(lines.length, Math.floor(Number(args.endLine))) : lines.length;

      if (start > lines.length) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "mismatch",
          data: {
            path: relPath,
            totalLines: lines.length,
            requestedStartLine: start,
          },
          error: {
            type: "validation_error",
            message: `startLine ${start} exceeds total lines (${lines.length}) in '${relPath}'.`,
          },
        });
      }

      const formattedLines: string[] = [];
      for (let i = start; i <= end; i++) {
        const lineNum = String(i).padStart(4, " ");
        formattedLines.push(`${lineNum} | ${lines[i - 1]}`);
      }

      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        data: {
          path: relPath,
          content: formattedLines.join("\n"),
          startLine: start,
          endLine: end,
          totalLines: lines.length,
        },
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "filesystem_error",
          message: `Error reading file '${relPath}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

/**
 * Write tool: Create or overwrite a file.
 */
export const writeTool: Tool = {
  name: "write",
  description:
    "Create or completely overwrite a file with specified content. Creates directories automatically.",
  parameters: {
    type: "object",
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
  execute: async (args: Record<string, any>): Promise<string> => {
    const rawPath = String(args.path || "").trim();
    if (!rawPath) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "'path' parameter is required for the write tool.",
        },
      });
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;
    const content = String(args.content ?? "");

    try {
      if (existsSync(filePath)) {
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
          return createToolResponse({
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
          });
        }
      }

      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const bytes = await Bun.write(filePath, content);
      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        data: {
          path: relPath,
          bytesWritten: bytes,
        },
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "filesystem_error",
          message: `Error writing file '${relPath}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

/**
 * Edit tool: Perform targeted substring replacement in an existing file.
 */
export const editTool: Tool = {
  name: "edit",
  description: "Replace an exact substring within an existing file with new content.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to edit.",
      },
      oldString: {
        type: "string",
        description: "The exact substring to replace.",
      },
      newString: {
        type: "string",
        description: "The replacement content.",
      },
    },
    required: ["path", "oldString", "newString"],
  },
  execute: async (args: Record<string, any>): Promise<string> => {
    const rawPath = String(args.path || "").trim();
    if (!rawPath) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "'path' parameter is required for the edit tool.",
        },
      });
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;
    const oldString = String(args.oldString ?? "");
    const newString = String(args.newString ?? "");

    if (!existsSync(filePath)) {
      return createToolResponse({
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: relPath,
        },
        error: {
          type: "filesystem_error",
          message: `File '${relPath}' does not exist.`,
        },
      });
    }

    try {
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "invalid_target",
          data: {
            path: relPath,
            targetType: "directory",
          },
          error: {
            type: "filesystem_error",
            message: `'${relPath}' is a directory, not a file. The 'edit' tool can only edit files.`,
          },
        });
      }

      const content = await Bun.file(filePath).text();

      if (!content.includes(oldString)) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "mismatch",
          data: {
            path: relPath,
            occurrences: 0,
          },
          error: {
            type: "filesystem_error",
            message: `The oldString was not found in '${relPath}'.`,
          },
        });
      }

      // Check occurrences
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "mismatch",
          data: {
            path: relPath,
            occurrences,
          },
          error: {
            type: "filesystem_error",
            message: `The oldString matched ${occurrences} occurrences in '${relPath}'.`,
          },
        });
      }

      const updatedContent = content.replace(oldString, newString);
      await Bun.write(filePath, updatedContent);

      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        data: {
          path: relPath,
          message: `Successfully updated '${relPath}'.`,
        },
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "filesystem_error",
          message: `Error editing file '${relPath}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

/**
 * Delete tool: Delete a file or directory on the filesystem.
 */
export const deleteTool: Tool = {
  name: "delete",
  description:
    "Delete a file or directory on the filesystem. Supports deleting single files or directories recursively.",
  parameters: {
    type: "object",
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
  execute: async (args: Record<string, any>): Promise<string> => {
    const rawPath = String(args.path || "").trim();
    if (!rawPath) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "'path' parameter is required for the delete tool.",
        },
      });
    }

    const targetPath = resolve(rawPath);
    const workspaceRoot = process.cwd();
    const relPath = relative(workspaceRoot, targetPath).replace(/\\/g, "/") || rawPath;

    // Safety checks: Prevent deleting root filesystem or the workspace root directory itself
    if (targetPath === resolve("/") || targetPath === workspaceRoot || relPath === "." || relPath === "") {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "validation_error",
          message: "Deleting the workspace root directory or system root is prohibited.",
        },
      });
    }

    if (!existsSync(targetPath)) {
      return createToolResponse({
        toolStatus: "success",
        outcome: "not_found",
        data: {
          path: relPath,
        },
        error: {
          type: "filesystem_error",
          message: `Path '${relPath}' does not exist.`,
        },
      });
    }

    try {
      const stats = statSync(targetPath);
      const isDir = stats.isDirectory();
      const recursive = Boolean(args.recursive);

      if (isDir) {
        if (!recursive) {
          return createToolResponse({
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
          });
        }
        rmSync(targetPath, { recursive: true, force: true });
        return createToolResponse({
          toolStatus: "success",
          outcome: "success",
          data: {
            path: relPath,
            targetType: "directory",
            message: `Successfully deleted directory '${relPath}'.`,
          },
        });
      }

      // Single file deletion
      rmSync(targetPath, { force: true });
      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        data: {
          path: relPath,
          targetType: "file",
          message: `Successfully deleted file '${relPath}'.`,
        },
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "filesystem_error",
          message: `Error deleting '${relPath}': ${err.message || String(err)}`,
        },
      });
    }
  },
};

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
