import { existsSync, mkdirSync, statSync } from "node:fs";
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
  suggestion?: string;
  metadata?: Record<string, any>;
}): string {
  const payload: ToolResponse<T> = {
    toolStatus: params.toolStatus || (params.outcome === "tool_error" ? "tool_error" : "success"),
    outcome: params.outcome,
    ...(params.data !== undefined && { data: params.data }),
    ...(params.execution && { execution: params.execution }),
    ...(params.error && { error: params.error }),
    ...(params.suggestion && { suggestion: params.suggestion }),
    ...(params.metadata && { metadata: params.metadata }),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Skill Discovery tool: Discover and inspect available skills and tools along with their YAML front-matter.
 */
export const skillDiscoveryTool: Tool = {
  name: "skill_discovery",
  description:
    "Discover and inspect available skills and tools along with their YAML front-matter (name, description, parameters, and metadata) to discover available capabilities.",
  parameters: {
    type: "object",
    properties: {
      skillName: {
        type: "string",
        description:
          "Optional skill name to inspect a specific skill (e.g., 'execute', 'codebase_discovery', 'debugging', 'validation_of_work', 'react', 'vite', 'typescript', 'bash', 'glob', 'grep', 'read', 'write', 'edit'). If omitted, lists all skills.",
      },
    },
  },
  execute: async (args: Record<string, any>): Promise<string> => {
    const candidateDirs = [
      resolve("skills"), // Current workspace skills
      resolve(import.meta.dir, "../skills"), // Built-in repository skills
      join(homedir(), ".zero/skills"), // Global user skills
    ];

    const requestedSkill = args.skillName ? String(args.skillName).trim().toLowerCase() : null;
    const seenSkills = new Set<string>();
    const toolsCatalog: Array<{ name: string; description: string; frontMatter: string }> = [];
    const skillsCatalog: Array<{ name: string; type: string; description: string; frontMatter: string }> = [];
    let fullSkillDoc: string | null = null;

    for (const skillsDir of candidateDirs) {
      if (!existsSync(skillsDir)) continue;

      try {
        const glob = new Bun.Glob("*/SKILL.md");
        for (const relFile of glob.scanSync({ cwd: skillsDir })) {
          const fullPath = join(skillsDir, relFile);
          const skillFolder = dirname(relFile);
          const skillKey = skillFolder.toLowerCase();

          if (seenSkills.has(skillKey)) continue;

          if (requestedSkill && skillKey === requestedSkill) {
            try {
              fullSkillDoc = await Bun.file(fullPath).text();
              seenSkills.add(skillKey);
              break;
            } catch {
              // Ignore
            }
          }

          if (requestedSkill && skillKey !== requestedSkill) {
            continue;
          }

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

    if (requestedSkill) {
      if (fullSkillDoc) {
        return createToolResponse({
          outcome: "success",
          data: {
            skillName: requestedSkill,
            documentation: fullSkillDoc,
          },
        });
      }
      return createToolResponse({
        outcome: "not_found",
        data: { requestedSkill },
        error: {
          type: "validation_error",
          message: `Skill '${requestedSkill}' was not found.`,
        },
        suggestion: "Call 'skill_discovery' with no arguments to list all available tools and skills.",
      });
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
 * Bash tool: Execute shell commands sandboxed to the project workspace directory.
 */
export const bashTool: Tool = {
  name: "bash",
  description:
    "Execute a shell command sandboxed within the project workspace (e.g. 'bun test', 'npm run build', 'tsc', 'git status').",
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
        suggestion: "Provide a valid shell command, e.g. bash({ command: 'bun test' }).",
      });
    }

    const timeout = typeof args.timeoutMs === "number" && args.timeoutMs > 0 ? args.timeoutMs : 30000;
    const workspaceRoot = process.cwd();

    try {
      const isWindows = process.platform === "win32";
      const shellCmd = isWindows
        ? ["powershell.exe", "-NoProfile", "-Command", rawCommand]
        : ["bash", "-c", rawCommand];

      const startTime = Date.now();
      const proc = Bun.spawn(shellCmd, {
        cwd: workspaceRoot,
        env: { ...process.env },
        stdout: "pipe",
        stderr: "pipe",
      });

      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill();
        } catch {
          // Ignore
        }
      }, timeout);

      const [stdoutText, stderrText] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      const execution: ToolExecutionDetails = {
        command: rawCommand,
        exitCode: timedOut ? null : exitCode,
        stdout: stdoutText.trimEnd(),
        stderr: stderrText.trimEnd(),
        durationMs,
        timedOut,
      };

      if (timedOut) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "timeout",
          execution,
          error: {
            type: "command_execution_error",
            message: `Command '${rawCommand}' timed out after ${timeout}ms.`,
          },
          suggestion: "Break down long-running commands or specify a larger timeoutMs.",
        });
      }

      if (exitCode !== 0) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "failure",
          execution,
          error: {
            type: "command_execution_error",
            message: `Command '${rawCommand}' exited with code ${exitCode}.`,
          },
          suggestion:
            "If this is a test, build, or type failure, use the 'debugging' skill to isolate and fix the root cause, or use 'read' to inspect failing files.",
        });
      }

      return createToolResponse({
        toolStatus: "success",
        outcome: "success",
        execution,
      });
    } catch (err: any) {
      return createToolResponse({
        toolStatus: "tool_error",
        outcome: "tool_error",
        error: {
          type: "tool_invocation_error",
          message: `Error executing command '${rawCommand}': ${err.message || String(err)}`,
        },
        suggestion: "Check if the command binary is installed or verify command syntax.",
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
        suggestion:
          "Use glob({ pattern: '**/*' }) without a custom path to search from the workspace root, or check parent directories.",
      });
    }

    try {
      const stats = statSync(targetPath);
      if (stats.isFile()) {
        const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || targetPath;
        const parentDir = dirname(rel) || ".";
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
          suggestion: `Use the 'read' tool to view this file (read({ path: "${rel}" })), or search its directory with glob({ pattern: "${pattern}", path: "${parentDir}" }).`,
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

      if (matches.length === 0) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "not_found",
          data: {
            path: rel,
            pattern,
            matches: [],
            count: 0,
          },
          suggestion:
            "Try a broader pattern like '**/*' or search for text contents across files using the 'grep' tool.",
        });
      }

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
        suggestion: "Check if the pattern is valid glob syntax or use 'grep' to search content.",
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
        suggestion: "Provide a keyword or regex pattern to search, e.g. grep({ pattern: 'functionName' }).",
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
        suggestion: `Use 'glob' to discover valid directory paths or search from workspace root with grep({ pattern: "${pattern}", path: "." }).`,
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
      if (matches.length === 0) {
        return createToolResponse({
          toolStatus: "success",
          outcome: "not_found",
          data: {
            path: rel,
            pattern,
            matches: [],
            count: 0,
          },
          suggestion:
            "Try case-insensitive search (caseSensitive: false), simplify the regex/pattern, or use 'glob' to find files and 'read' to inspect them.",
        });
      }

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
        suggestion:
          "If pattern is a complex regex, try a simpler literal string or verify regex escape characters.",
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
        suggestion: "Provide a file path, e.g. read({ path: 'src/index.ts' }).",
      });
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;

    if (!existsSync(filePath)) {
      const fileBase = basename(filePath);
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
        suggestion: `Use the 'glob' tool (e.g. glob({ pattern: "**/*${fileBase}*" }) or glob({ pattern: "**/*" })) to find the correct file path.`,
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
          suggestion: `Use the 'glob' tool to inspect directory contents (e.g. glob({ pattern: "**/*", path: "${relPath}" })).`,
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
          suggestion: `Read lines 1-${Math.min(lines.length, 100)} instead.`,
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
        suggestion: "Check permissions or verify if the file is binary.",
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
        suggestion: "Provide a file path, e.g. write({ path: 'src/app.ts', content: '...' }).",
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
            suggestion: `Specify a filename inside this directory, e.g. write({ path: "${relPath}/filename.ext", content: "..." }).`,
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
        suggestion: "Verify file permissions and path validity.",
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
        suggestion:
          "Provide a file path, e.g. edit({ path: 'src/index.ts', oldString: '...', newString: '...' }).",
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
        suggestion: `If you want to create a new file, use the 'write' tool instead: write({ path: "${relPath}", content: "..." }).`,
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
          suggestion: "Use 'glob' to list files or 'read' to inspect a specific file.",
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
          suggestion: `Use the 'read' tool (read({ path: "${relPath}" })) to inspect the exact lines, whitespace, and formatting of the file before editing.`,
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
          suggestion:
            "Use 'read' to inspect the surrounding lines and include more lines in oldString to uniquely identify the replacement chunk.",
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
        suggestion: "Check file permissions or use the 'read' tool to verify file contents.",
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
            message: `'${name}' is a process/domain skill, NOT a callable tool.`,
          },
          suggestion: `To inspect the guidelines for '${name}', call: skill_discovery({ skillName: "${name}" }). Available callable tools are: skill_discovery, bash, glob, grep, read, write, edit.`,
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
          message: `Tool '${name}' is not recognized.`,
        },
        suggestion: `Available tools: ${availableNames}. Suggestion: If you want to discover skills and workflows, use 'skill_discovery'. If you want to execute terminal commands (tests, builds, typecheck), use 'bash'. If you want to list/discover files, use 'glob'. If you want to read a file, use 'read'. If you want to search code, use 'grep'. If you want to create a file, use 'write'. If you want to edit a file, use 'edit'.`,
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
        suggestion: "Check your tool arguments or use 'skill_discovery' to inspect the tool schema.",
      });
    }
  }
}
