import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  bashTool,
  defaultTools,
  editTool,
  globTool,
  grepTool,
  readTool,
  skillDiscoveryTool,
  ToolRegistry,
  writeTool,
} from "../src/tools.ts";

const TEST_DIR = resolve("./.test_sandbox");

describe("Coding Tools & Skills Suite", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("skillDiscoveryTool discovers and lists YAML front-matters of all skills", async () => {
    const res = await skillDiscoveryTool.execute({});
    expect(res).toContain("Available Skills");
    expect(res).toContain("execute");
    expect(res).toContain("codebase_discovery");
    expect(res).toContain("debugging");
    expect(res).toContain("validation_of_work");
    expect(res).toContain("react");
    expect(res).toContain("vite");
    expect(res).toContain("typescript");
    expect(res).toContain("bash");
    expect(res).toContain("glob");
    expect(res).toContain("grep");
    expect(res).toContain("read");
    expect(res).toContain("write");
    expect(res).toContain("edit");

    // Test specific skill query
    const debugRes = await skillDiscoveryTool.execute({ skillName: "debugging" });
    expect(debugRes).toContain("Skill: [debugging]");
    expect(debugRes).toContain("name: debugging");
    expect(debugRes).toContain("reproduce");
  });

  it("verifies all 14 skill files exist with valid front-matter and when_to_use", async () => {
    const skillNames = [
      "execute",
      "skill_discovery",
      "codebase_discovery",
      "debugging",
      "validation_of_work",
      "react",
      "vite",
      "typescript",
      "bash",
      "glob",
      "grep",
      "read",
      "write",
      "edit",
    ];

    for (const name of skillNames) {
      const skillPath = resolve(`skills/${name}/SKILL.md`);
      expect(existsSync(skillPath)).toBe(true);

      const content = await Bun.file(skillPath).text();
      expect(content.startsWith("---")).toBe(true);
      expect(content).toContain(`name: ${name}`);
      expect(content).toContain("description:");
      expect(content).toContain("when_to_use:");
    }
  });

  it("bashTool executes shell commands and captures stdout and exit status", async () => {
    const res = await bashTool.execute({
      command: "echo 'hello from bash tool'",
    });

    expect(res).toContain("Command completed successfully");
    expect(res).toContain("hello from bash tool");
  });

  it("bashTool returns descriptive errors when a command fails", async () => {
    const res = await bashTool.execute({
      command: "node -e 'process.exit(1)'",
    });

    expect(res).toContain("Command exited with code 1");
    expect(res).toContain("debugging");
  });

  it("bashTool enforces timeout limits on long running commands", async () => {
    const res = await bashTool.execute({
      command: "bun -e 'await new Promise(r => setTimeout(r, 2000))'",
      timeoutMs: 100,
    });

    expect(res).toContain("timed out after 100ms");
  });

  it("writeTool creates directories and writes content", async () => {
    const testFile = `${TEST_DIR}/nested/hello.txt`;
    const res = await writeTool.execute({
      path: testFile,
      content: "Hello, World!\nLine 2\nLine 3",
    });

    expect(res).toContain("Successfully wrote");
    expect(existsSync(testFile)).toBe(true);

    const text = await Bun.file(testFile).text();
    expect(text).toBe("Hello, World!\nLine 2\nLine 3");
  });

  it("readTool reads file with line numbers and supports line slicing", async () => {
    const testFile = `${TEST_DIR}/sample.txt`;
    await writeTool.execute({
      path: testFile,
      content: "Alpha\nBeta\nGamma\nDelta\nEpsilon",
    });

    // Read full file
    const fullRes = await readTool.execute({ path: testFile });
    expect(fullRes).toContain("1 | Alpha");
    expect(fullRes).toContain("5 | Epsilon");

    // Read line slice 2 to 4
    const sliceRes = await readTool.execute({
      path: testFile,
      startLine: 2,
      endLine: 4,
    });
    expect(sliceRes).not.toContain("1 | Alpha");
    expect(sliceRes).toContain("2 | Beta");
    expect(sliceRes).toContain("3 | Gamma");
    expect(sliceRes).toContain("4 | Delta");
    expect(sliceRes).not.toContain("5 | Epsilon");
  });

  it("editTool replaces unique substring correctly", async () => {
    const testFile = `${TEST_DIR}/code.ts`;
    await writeTool.execute({
      path: testFile,
      content: "const a = 1;\nconst b = 2;\nconst c = 3;",
    });

    const res = await editTool.execute({
      path: testFile,
      oldString: "const b = 2;",
      newString: "const b = 42;",
    });

    expect(res).toContain("Successfully updated");
    const updated = await Bun.file(testFile).text();
    expect(updated).toBe("const a = 1;\nconst b = 42;\nconst c = 3;");
  });

  it("editTool fails if substring is missing or ambiguous", async () => {
    const testFile = `${TEST_DIR}/duplicate.txt`;
    await writeTool.execute({
      path: testFile,
      content: "foo\nfoo\nbar",
    });

    // Missing substring
    const missingRes = await editTool.execute({
      path: testFile,
      oldString: "baz",
      newString: "qux",
    });
    expect(missingRes).toContain("Error: The oldString was not found");

    // Ambiguous substring (matches multiple times)
    const dupRes = await editTool.execute({
      path: testFile,
      oldString: "foo",
      newString: "replaced",
    });
    expect(dupRes).toContain("Error: The oldString matched 2 occurrences");
  });

  it("globTool finds matching files", async () => {
    await writeTool.execute({ path: `${TEST_DIR}/a.ts`, content: "a" });
    await writeTool.execute({ path: `${TEST_DIR}/b.ts`, content: "b" });
    await writeTool.execute({ path: `${TEST_DIR}/c.json`, content: "{}" });

    const res = await globTool.execute({
      pattern: "*.ts",
      path: TEST_DIR,
    });

    expect(res).toContain("a.ts");
    expect(res).toContain("b.ts");
    expect(res).not.toContain("c.json");
  });

  it("grepTool finds pattern matches with line numbers", async () => {
    await writeTool.execute({
      path: `${TEST_DIR}/file1.txt`,
      content: "The quick brown fox\njumps over\nthe lazy dog",
    });
    await writeTool.execute({
      path: `${TEST_DIR}/file2.txt`,
      content: "No animals here\njust foxes playing",
    });

    const res = await grepTool.execute({
      pattern: "fox",
      path: TEST_DIR,
      caseSensitive: false,
    });

    expect(res).toContain("The quick brown fox");
    expect(res).toContain("just foxes playing");
  });

  it("ToolRegistry registers tools and generates OpenAI JSON schemas", () => {
    const registry = new ToolRegistry(defaultTools);
    expect(registry.getAll().length).toBe(7);

    const openAITools = registry.toOpenAITools();
    expect(openAITools.length).toBe(7);
    expect(openAITools[0]?.type).toBe("function");
    expect(openAITools.map((t) => t.function.name)).toEqual([
      "skill_discovery",
      "bash",
      "glob",
      "grep",
      "read",
      "write",
      "edit",
    ]);
  });

  it("returns proper errors and directions when tools are misused", async () => {
    // 1. Calling read on a directory -> suggests glob
    mkdirSync(TEST_DIR, { recursive: true });
    const dirRes = await readTool.execute({ path: TEST_DIR });
    expect(dirRes).toContain("is a directory, not a file");
    expect(dirRes).toContain("Suggestion: Use the 'glob' tool");

    // 2. Calling read on non-existent file -> suggests glob
    const missingFileRes = await readTool.execute({ path: `${TEST_DIR}/missing.txt` });
    expect(missingFileRes).toContain("does not exist");
    expect(missingFileRes).toContain("Suggestion: Use the 'glob' tool");

    // 3. Calling edit on non-existent file -> suggests write
    const editMissingRes = await editTool.execute({
      path: `${TEST_DIR}/nonexistent.txt`,
      oldString: "a",
      newString: "b",
    });
    expect(editMissingRes).toContain("use the 'write' tool instead");

    // 4. Calling edit with unmatched string -> suggests read
    await writeTool.execute({ path: `${TEST_DIR}/sample.txt`, content: "hello world" });
    const editUnmatchedRes = await editTool.execute({
      path: `${TEST_DIR}/sample.txt`,
      oldString: "goodbye",
      newString: "bye",
    });
    expect(editUnmatchedRes).toContain("oldString was not found");
    expect(editUnmatchedRes).toContain("Suggestion: Use the 'read' tool");

    // 5. Calling glob on a file instead of directory -> suggests read
    const globFileRes = await globTool.execute({
      pattern: "*.txt",
      path: `${TEST_DIR}/sample.txt`,
    });
    expect(globFileRes).toContain("is a file, not a directory");
    expect(globFileRes).toContain("Suggestion: Use the 'read' tool");

    // 6. Calling unrecognized tool name in registry -> suggests valid tools
    const registry = new ToolRegistry(defaultTools);
    const unrecRes = await registry.execute("list_files", { dir: "." });
    expect(unrecRes).toContain("Tool 'list_files' is not recognized");
    expect(unrecRes).toContain("Available tools: skill_discovery, bash, glob, grep, read, write, edit");
    expect(unrecRes).toContain("If you want to list/discover files, use 'glob'");
  });
});
