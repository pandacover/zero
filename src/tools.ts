import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Tool } from "./types.ts";

/**
 * Browse Skills tool: List all skills' YAML front-matter (name, description, and metadata).
 */
export const browseSkillsTool: Tool = {
  name: "browse_skills",
  description:
    "List all skills and tools along with their YAML front-matter (name, description, parameters, and metadata) to discover available capabilities.",
  parameters: {
    type: "object",
    properties: {
      skillName: {
        type: "string",
        description:
          "Optional skill name to inspect a specific skill (e.g., 'glob', 'grep', 'read', 'write', 'edit'). If omitted, lists all skills.",
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
        ? `Error: Skill '${requestedSkill}' was not found. Suggestion: Call 'browse_skills' with no arguments to list all available tools (glob, grep, read, write, edit) and skills.`
        : "No skills found under workspace or ~/.zero/skills directory. Available built-in tools are: glob, grep, read, write, edit.";
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
    const targetPath = resolve(String(args.path || "."));

    if (!existsSync(targetPath)) {
      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
      return `Error: Directory '${rel}' does not exist. Suggestion: Use glob({ pattern: "**/*" }) without a custom path to search from the workspace root, or check parent directories.`;
    }

    try {
      const stats = statSync(targetPath);
      if (stats.isFile()) {
        const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/");
        const parentDir = dirname(rel) || ".";
        return `Error: Path '${rel}' is a file, not a directory. Suggestion: Use the 'read' tool to view this file (read({ path: "${rel}" })), or search its directory with glob({ pattern: "${pattern}", path: "${parentDir}" }).`;
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

      if (matches.length === 0) {
        const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
        return `No files matched pattern '${pattern}' in '${rel}'. Suggestion: Try a broader pattern like '**/*' or search for text contents across files using the 'grep' tool.`;
      }

      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
      return `Found ${matches.length} matches for '${pattern}' in '${rel}':\n${matches.join("\n")}`;
    } catch (err: any) {
      return `Error scanning glob '${pattern}': ${err.message || String(err)}. Suggestion: Check if the pattern is valid glob syntax or use 'grep' to search content.`;
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
      return `Error: 'pattern' parameter is required for grep. Suggestion: Provide a keyword or regex pattern to search, e.g. grep({ pattern: "functionName" }).`;
    }

    if (!existsSync(targetPath)) {
      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
      return `Error: Path '${rel}' does not exist. Suggestion: Use 'glob' to discover valid directory paths or search from workspace root with grep({ pattern: "${pattern}", path: "." }).`;
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

      const rel = relative(process.cwd(), targetPath).replace(/\\/g, "/") || ".";
      if (results.length === 0) {
        return `No matches found for '${pattern}' in '${rel}'. Suggestion: Try case-insensitive search (caseSensitive: false), simplify the regex/pattern, or use 'glob' to find files and 'read' to inspect them.`;
      }

      return `Found ${results.length} matches for '${pattern}' in '${rel}':\n${results.join("\n")}`;
    } catch (err: any) {
      return `Error in grep '${pattern}': ${err.message || String(err)}. Suggestion: If pattern is a complex regex, try a simpler literal string or verify regex escape characters.`;
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
      return "Error: 'path' parameter is required for the read tool. Suggestion: Provide a file path, e.g. read({ path: 'src/index.ts' }).";
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;

    if (!existsSync(filePath)) {
      const fileBase = basename(filePath);
      return `Error: File '${relPath}' does not exist. Suggestion: Use the 'glob' tool (e.g. glob({ pattern: "**/*${fileBase}*" }) or glob({ pattern: "**/*" })) to find the correct file path.`;
    }

    try {
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        return `Error: '${relPath}' is a directory, not a file. The 'read' tool can only read files. Suggestion: Use the 'glob' tool to inspect directory contents (e.g. glob({ pattern: "**/*", path: "${relPath}" })).`;
      }

      const content = await Bun.file(filePath).text();
      const lines = content.split(/\r?\n/);

      if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
        return `[File: ${relPath} is empty (0 lines)]`;
      }

      const start = args.startLine ? Math.max(1, Math.floor(Number(args.startLine))) : 1;
      const end = args.endLine ? Math.min(lines.length, Math.floor(Number(args.endLine))) : lines.length;

      if (start > lines.length) {
        return `Error: startLine ${start} exceeds total lines (${lines.length}) in '${relPath}'. Suggestion: Read lines 1-${Math.min(lines.length, 100)} instead.`;
      }

      const formattedLines: string[] = [];
      for (let i = start; i <= end; i++) {
        const lineNum = String(i).padStart(4, " ");
        formattedLines.push(`${lineNum} | ${lines[i - 1]}`);
      }

      return `[File: ${relPath} (Lines ${start}-${end} of ${lines.length})]\n` + formattedLines.join("\n");
    } catch (err: any) {
      return `Error reading file '${relPath}': ${err.message || String(err)}. Suggestion: Check permissions or verify if the file is binary.`;
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
      return "Error: 'path' parameter is required for the write tool. Suggestion: Provide a file path, e.g. write({ path: 'src/app.ts', content: '...' }).";
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;
    const content = String(args.content ?? "");

    try {
      if (existsSync(filePath)) {
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
          return `Error: Cannot write to '${relPath}' because it is an existing directory. Suggestion: Specify a filename inside this directory, e.g. write({ path: "${relPath}/filename.ext", content: "..." }).`;
        }
      }

      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const bytes = await Bun.write(filePath, content);
      return `Successfully wrote ${bytes} bytes to '${relPath}'.`;
    } catch (err: any) {
      return `Error writing file '${relPath}': ${err.message || String(err)}. Suggestion: Verify file permissions and path validity.`;
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
      return "Error: 'path' parameter is required for the edit tool. Suggestion: Provide a file path, e.g. edit({ path: 'src/index.ts', oldString: '...', newString: '...' }).";
    }

    const filePath = resolve(rawPath);
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/") || rawPath;
    const oldString = String(args.oldString ?? "");
    const newString = String(args.newString ?? "");

    if (!existsSync(filePath)) {
      return `Error: File '${relPath}' does not exist. If you want to create a new file, use the 'write' tool instead: write({ path: "${relPath}", content: "..." }).`;
    }

    try {
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        return `Error: '${relPath}' is a directory, not a file. The 'edit' tool can only edit files. Suggestion: Use 'glob' to list files or 'read' to inspect a specific file.`;
      }

      const content = await Bun.file(filePath).text();

      if (!content.includes(oldString)) {
        return `Error: The oldString was not found in '${relPath}'. Suggestion: Use the 'read' tool (read({ path: "${relPath}" })) to inspect the exact lines, whitespace, and formatting of the file before editing.`;
      }

      // Check occurrences
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return `Error: The oldString matched ${occurrences} occurrences in '${relPath}'. Suggestion: Use 'read' to inspect the surrounding lines and include more lines in oldString to uniquely identify the replacement chunk.`;
      }

      const updatedContent = content.replace(oldString, newString);
      await Bun.write(filePath, updatedContent);

      return `Successfully updated '${relPath}'.`;
    } catch (err: any) {
      return `Error editing file '${relPath}': ${err.message || String(err)}. Suggestion: Check file permissions or use the 'read' tool to verify file contents.`;
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
      const availableNames = Array.from(this.tools.keys()).join(", ");
      return `Error: Tool '${name}' is not recognized. Available tools: ${availableNames}. Suggestion: If you want to list/discover files, use 'glob' (e.g. glob({ pattern: "**/*" })). If you want to read a file, use 'read'. If you want to search code, use 'grep'. If you want to create a file, use 'write'. If you want to discover skills, use 'browse_skills'.`;
    }
    try {
      return await tool.execute(args);
    } catch (err: any) {
      return `Error executing tool '${name}': ${err.message || String(err)}. Suggestion: Check your tool arguments or use 'browse_skills' to inspect the tool schema.`;
    }
  }
}
