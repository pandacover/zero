import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { Tool } from "./types.ts";

/**
 * Browse Skills tool: List all skills' YAML front-matter (name, description, and metadata).
 */
export const browseSkillsTool: Tool = {
  name: "browse_skills",
  description: "List all skills and tools along with their YAML front-matter (name, description, parameters, and metadata) to discover available capabilities.",
  parameters: {
    type: "object",
    properties: {
      skillName: {
        type: "string",
        description: "Optional skill name to inspect a specific skill (e.g., 'glob', 'grep', 'read', 'write', 'edit'). If omitted, lists all skills.",
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
    const results: string[] = [];

    for (const skillsDir of candidateDirs) {
      if (!existsSync(skillsDir)) continue;

      try {
        const glob = new Bun.Glob("*/SKILL.md");
        for (const relFile of glob.scanSync({ cwd: skillsDir })) {
          const fullPath = join(skillsDir, relFile);
          const skillFolder = dirname(relFile);
          const skillKey = skillFolder.toLowerCase();

          if (seenSkills.has(skillKey)) continue;

          if (requestedSkill && skillKey !== requestedSkill) {
            continue;
          }

          try {
            const content = await Bun.file(fullPath).text();
            const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (match && match[1]) {
              seenSkills.add(skillKey);
              results.push(`### Skill: [${skillFolder}]\n\`\`\`yaml\n${match[1].trim()}\n\`\`\``);
            }
          } catch {
            // Ignore unreadable skill files
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }

    if (results.length === 0) {
      return requestedSkill
        ? `Skill '${requestedSkill}' was not found in skills directories.`
        : "No skills found under workspace or ~/.zero/skills directory.";
    }

    return `## Available Skills (${results.length} found):\n\n` + results.join("\n\n");
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
    const cwd = resolve(String(args.path || "."));

    if (!existsSync(cwd)) {
      return `Error: Directory '${cwd}' does not exist.`;
    }

    try {
      const glob = new Bun.Glob(pattern);
      const matches: string[] = [];

      for (const file of glob.scanSync({ cwd, onlyFiles: false })) {
        matches.push(file.replace(/\\/g, "/"));
        if (matches.length >= 200) {
          matches.push("... (results capped at 200 matches)");
          break;
        }
      }

      if (matches.length === 0) {
        return `No files matched pattern '${pattern}' in '${cwd}'.`;
      }

      return `Found ${matches.length} matches for '${pattern}' in '${cwd}':\n${matches.join("\n")}`;
    } catch (err: any) {
      return `Error scanning glob '${pattern}': ${err.message || String(err)}`;
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

    if (!existsSync(targetPath)) {
      return `Error: Path '${targetPath}' does not exist.`;
    }

    try {
      const flags = caseSensitive ? "g" : "gi";
      const regex = new RegExp(pattern, flags);
      const results: string[] = [];

      const stats = statSync(targetPath);
      const filesToSearch: string[] = [];

      if (stats.isFile()) {
        filesToSearch.push(targetPath);
      } else {
        const globFilter = includePattern ? includePattern : "**/*";
        const glob = new Bun.Glob(globFilter);
        for (const relFile of glob.scanSync({ cwd: targetPath, onlyFiles: true })) {
          // Skip node_modules and .git by default
          if (relFile.includes("node_modules") || relFile.includes(".git")) {
            continue;
          }
          filesToSearch.push(join(targetPath, relFile));
        }
      }

      for (const fullPath of filesToSearch) {
        if (results.length >= 100) {
          results.push("... (results capped at 100 matches)");
          break;
        }

        try {
          const content = await Bun.file(fullPath).text();
          const lines = content.split(/\r?\n/);
          const relPath = relative(process.cwd(), fullPath).replace(/\\/g, "/");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            regex.lastIndex = 0;
            if (regex.test(line)) {
              results.push(`${relPath}:${i + 1}: ${line.trimEnd()}`);
              if (results.length >= 100) break;
            }
          }
        } catch {
          // Ignore unreadable or binary files
        }
      }

      if (results.length === 0) {
        return `No matches found for '${pattern}' in '${targetPath}'.`;
      }

      return `Found ${results.length} matches for '${pattern}':\n${results.join("\n")}`;
    } catch (err: any) {
      return `Error in grep: ${err.message || String(err)}`;
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
    const filePath = resolve(String(args.path || ""));

    if (!existsSync(filePath)) {
      return `Error: File '${filePath}' does not exist.`;
    }

    try {
      const content = await Bun.file(filePath).text();
      const lines = content.split(/\r?\n/);

      const start = args.startLine ? Math.max(1, Math.floor(Number(args.startLine))) : 1;
      const end = args.endLine ? Math.min(lines.length, Math.floor(Number(args.endLine))) : lines.length;

      if (start > lines.length) {
        return `Error: startLine ${start} exceeds total lines (${lines.length}) in file '${filePath}'.`;
      }

      const formattedLines: string[] = [];
      for (let i = start; i <= end; i++) {
        const lineNum = String(i).padStart(4, " ");
        formattedLines.push(`${lineNum} | ${lines[i - 1]}`);
      }

      const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/");
      return `[File: ${relPath} (Lines ${start}-${end} of ${lines.length})]\n` + formattedLines.join("\n");
    } catch (err: any) {
      return `Error reading file '${filePath}': ${err.message || String(err)}`;
    }
  },
};

/**
 * Write tool: Create or overwrite a file.
 */
export const writeTool: Tool = {
  name: "write",
  description: "Create or completely overwrite a file with specified content. Creates directories automatically.",
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
    const filePath = resolve(String(args.path || ""));
    const content = String(args.content ?? "");

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const bytes = await Bun.write(filePath, content);
      const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/");
      return `Successfully wrote ${bytes} bytes to '${relPath}'.`;
    } catch (err: any) {
      return `Error writing file '${filePath}': ${err.message || String(err)}`;
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
    const filePath = resolve(String(args.path || ""));
    const oldString = String(args.oldString ?? "");
    const newString = String(args.newString ?? "");

    if (!existsSync(filePath)) {
      return `Error: File '${filePath}' does not exist.`;
    }

    try {
      const content = await Bun.file(filePath).text();

      if (!content.includes(oldString)) {
        return `Error: The oldString was not found in '${filePath}'. Make sure whitespace and characters match exactly.`;
      }

      // Check occurrences
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return `Error: The oldString matched ${occurrences} occurrences in '${filePath}'. Provide more surrounding context to uniquely identify the chunk.`;
      }

      const updatedContent = content.replace(oldString, newString);
      await Bun.write(filePath, updatedContent);

      const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/");
      return `Successfully updated '${relPath}'.`;
    } catch (err: any) {
      return `Error editing file '${filePath}': ${err.message || String(err)}`;
    }
  },
};

/**
 * Default coding & skill tools collection.
 */
export const defaultTools: Tool[] = [
  browseSkillsTool,
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
      return `Error: Tool '${name}' is not recognized.`;
    }
    try {
      return await tool.execute(args);
    } catch (err: any) {
      return `Error executing tool '${name}': ${err.message || String(err)}`;
    }
  }
}
