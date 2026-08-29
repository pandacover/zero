import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  browseSkillsTool,
  defaultTools,
  editTool,
  globTool,
  grepTool,
  readTool,
  ToolRegistry,
  writeTool,
} from "../src/tools.ts";

const TEST_DIR = resolve("./.test_sandbox");

describe("Coding Tools", () => {
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

  it("browseSkillsTool discovers and lists YAML front-matters of all skills", async () => {
    const res = await browseSkillsTool.execute({});
    expect(res).toContain("Available Skills");
    expect(res).toContain("glob");
    expect(res).toContain("grep");
    expect(res).toContain("read");
    expect(res).toContain("write");
    expect(res).toContain("edit");

    // Test specific skill query
    const globRes = await browseSkillsTool.execute({ skillName: "glob" });
    expect(globRes).toContain("Skill: [glob]");
    expect(globRes).toContain("name: glob");
    expect(globRes).not.toContain("Skill: [grep]");
  });

  it("verifies all skill files exist with valid front-matter", async () => {
    const skillNames = ["glob", "grep", "read", "write", "edit"];
    for (const name of skillNames) {
      const skillPath = resolve(`skills/${name}/SKILL.md`);
      expect(existsSync(skillPath)).toBe(true);

      const content = await Bun.file(skillPath).text();
      expect(content.startsWith("---")).toBe(true);
      expect(content).toContain(`name: ${name}`);
      expect(content).toContain("description:");
    }
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
    expect(registry.getAll().length).toBe(6);

    const openAITools = registry.toOpenAITools();
    expect(openAITools.length).toBe(6);
    expect(openAITools[0]?.type).toBe("function");
    expect(openAITools.map((t) => t.function.name)).toEqual([
      "browse_skills",
      "glob",
      "grep",
      "read",
      "write",
      "edit",
    ]);
  });
});
