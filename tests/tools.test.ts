import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  bashTool,
  createTool,
  defaultTools,
  deleteTool,
  editTool,
  globTool,
  grepTool,
  readTool,
  resolveToolPath,
  skillDiscoveryTool,
  ToolRegistry,
  validateFileTarget,
  writeTool,
} from "../src/tools.ts";
import type { ToolResponse } from "../src/types.ts";

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

  it("skillDiscoveryTool returns structured catalog separating tools and skills", async () => {
    const rawRes = await skillDiscoveryTool.execute({});
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.data).toBeDefined();
    expect(res.data.tools.length).toBeGreaterThanOrEqual(8);
    expect(res.data.skills.length).toBeGreaterThanOrEqual(7);

    const toolNames = res.data.tools.map((t: any) => t.name);
    expect(toolNames).toContain("bash");
    expect(toolNames).toContain("glob");
    expect(toolNames).toContain("grep");
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("write");
    expect(toolNames).toContain("edit");
    expect(toolNames).toContain("delete");
    expect(toolNames).toContain("skill_discovery");

    const skillNames = res.data.skills.map((s: any) => s.name);
    expect(skillNames).toContain("execute");
    expect(skillNames).toContain("codebase_discovery");
    expect(skillNames).toContain("debugging");
    expect(skillNames).toContain("validation_of_work");
    expect(skillNames).toContain("react");
    expect(skillNames).toContain("vite");
    expect(skillNames).toContain("typescript");

    // Test specific skill query returns full markdown documentation
    const rawDebug = await skillDiscoveryTool.execute({ skillName: "debugging" });
    const debugRes: ToolResponse = JSON.parse(rawDebug);
    expect(debugRes.toolStatus).toBe("success");
    expect(debugRes.outcome).toBe("success");
    expect(debugRes.data.skillName).toBe("debugging");
    expect(debugRes.data.documentation).toContain("Debugging Skill");
    expect(debugRes.data.documentation).toContain("reproduce");
  });

  it("skillDiscoveryTool fetches multiple skills simultaneously via skillNames array or comma-separated list", async () => {
    // 1. Fetching multiple skills via array
    const rawMulti = await skillDiscoveryTool.execute({
      skillNames: ["react", "vite", "typescript"],
    });
    const multiRes: ToolResponse = JSON.parse(rawMulti);

    expect(multiRes.toolStatus).toBe("success");
    expect(multiRes.outcome).toBe("success");
    expect(multiRes.data.requestedSkills).toEqual(["react", "vite", "typescript"]);
    expect(multiRes.data.foundCount).toBe(3);
    expect(multiRes.data.missing).toEqual([]);
    expect(multiRes.data.skills.length).toBe(3);
    expect(multiRes.data.skills[0].skillName).toBe("react");
    expect(multiRes.data.skills[0].documentation).toContain("React Domain Skill");
    expect(multiRes.data.skills[1].skillName).toBe("vite");
    expect(multiRes.data.skills[1].documentation).toContain("Vite Domain Skill");
    expect(multiRes.data.skills[2].skillName).toBe("typescript");
    expect(multiRes.data.skills[2].documentation).toContain("TypeScript Domain Skill");

    // 2. Fetching via comma-separated string
    const rawComma = await skillDiscoveryTool.execute({
      skillName: "react, vite",
    });
    const commaRes: ToolResponse = JSON.parse(rawComma);
    expect(commaRes.toolStatus).toBe("success");
    expect(commaRes.outcome).toBe("success");
    expect(commaRes.data.foundCount).toBe(2);

    // 3. Partial match (some found, some missing)
    const rawPartial = await skillDiscoveryTool.execute({
      skillNames: ["react", "non_existent_skill_xyz"],
    });
    const partialRes: ToolResponse = JSON.parse(rawPartial);
    expect(partialRes.toolStatus).toBe("success");
    expect(partialRes.outcome).toBe("success");
    expect(partialRes.data.foundCount).toBe(1);
    expect(partialRes.data.missing).toEqual(["non_existent_skill_xyz"]);

    // 4. None found
    const rawNone = await skillDiscoveryTool.execute({
      skillNames: ["fake_skill_1", "fake_skill_2"],
    });
    const noneRes: ToolResponse = JSON.parse(rawNone);
    expect(noneRes.outcome).toBe("not_found");
    expect(noneRes.error?.message).toContain("None of the requested skills");
  });

  it("verifies all 15 skill files exist with valid front-matter and when_to_use", async () => {
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
      "delete",
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

  it("bashTool captures execution block with exitCode, stdout, and status on success", async () => {
    const rawRes = await bashTool.execute({
      command: "echo 'hello from bash tool'",
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.execution).toBeDefined();
    expect(res.execution?.command).toBe("echo 'hello from bash tool'");
    expect(res.execution?.exitCode).toBe(0);
    expect(res.execution?.stdout).toContain("hello from bash tool");
    expect(res.execution?.timedOut).toBe(false);
  });

  it("bashTool returns toolStatus: 'success' and outcome: 'failure' when command returns non-zero", async () => {
    const rawRes = await bashTool.execute({
      command: "node -e 'process.exit(1)'",
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("failure");
    expect(res.execution?.exitCode).toBe(1);
    expect(res.error?.type).toBe("command_execution_error");
  });

  it("bashTool enforces timeout limits on long running commands", async () => {
    const rawRes = await bashTool.execute({
      command: "bun -e 'await new Promise(r => setTimeout(r, 2000))'",
      timeoutMs: 100,
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("timeout");
    expect(res.execution?.timedOut).toBe(true);
    expect(res.error?.type).toBe("command_execution_error");
  });

  it("bashTool executes OS-agnostic POSIX syntax (command chaining, quoting, and pipes)", async () => {
    const rawRes = await bashTool.execute({
      command: "echo 'first line' && echo 'second line' | grep 'second'",
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.execution?.stdout).toContain("first line");
    expect(res.execution?.stdout).toContain("second line");
  });

  it("bashTool rejects file creation and editing attempts and directs agent to write or edit tools", async () => {
    // 1. Output redirection >
    const redirectRes: ToolResponse = JSON.parse(
      await bashTool.execute({ command: "echo 'hello' > src/index.ts" })
    );
    expect(redirectRes.toolStatus).toBe("tool_error");
    expect(redirectRes.outcome).toBe("tool_error");
    expect(redirectRes.error?.message).toContain("Redirecting output to a file");
    expect(redirectRes.error?.message).toContain("write");
    expect(redirectRes.error?.message).toContain("edit");

    // 2. Output append >>
    const appendRes: ToolResponse = JSON.parse(
      await bashTool.execute({ command: "echo 'export const x = 1;' >> src/index.ts" })
    );
    expect(appendRes.toolStatus).toBe("tool_error");
    expect(appendRes.outcome).toBe("tool_error");
    expect(appendRes.error?.message).toContain("Redirecting output to a file");

    // 3. Touch command
    const touchRes: ToolResponse = JSON.parse(
      await bashTool.execute({ command: "touch src/types.ts" })
    );
    expect(touchRes.toolStatus).toBe("tool_error");
    expect(touchRes.outcome).toBe("tool_error");
    expect(touchRes.error?.message).toContain("touch");
    expect(touchRes.error?.message).toContain("write");

    // 4. Heredoc writing
    const heredocRes: ToolResponse = JSON.parse(
      await bashTool.execute({ command: "cat << 'EOF' > file.txt\nsome content\nEOF" })
    );
    expect(heredocRes.toolStatus).toBe("tool_error");
    expect(heredocRes.outcome).toBe("tool_error");
    expect(heredocRes.error?.message).toContain("write");

    // 5. In-place sed editing
    const sedRes: ToolResponse = JSON.parse(
      await bashTool.execute({ command: "sed -i 's/foo/bar/g' file.txt" })
    );
    expect(sedRes.toolStatus).toBe("tool_error");
    expect(sedRes.outcome).toBe("tool_error");
    expect(sedRes.error?.message).toContain("sed -i");
    expect(sedRes.error?.message).toContain("edit");

    // 6. Inline node fs file writing
    const fsRes: ToolResponse = JSON.parse(
      await bashTool.execute({ command: "node -e 'fs.writeFileSync(\"a.txt\", \"b\")'" })
    );
    expect(fsRes.toolStatus).toBe("tool_error");
    expect(fsRes.outcome).toBe("tool_error");
    expect(fsRes.error?.message).toContain("write");
  });

  it("writeTool creates directories and writes content with structured response", async () => {
    const testFile = `${TEST_DIR}/nested/hello.txt`;
    const rawRes = await writeTool.execute({
      path: testFile,
      content: "Hello, World!\nLine 2\nLine 3",
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.data.path).toContain("hello.txt");
    expect(res.data.bytesWritten).toBeGreaterThan(0);
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
    const rawFull = await readTool.execute({ path: testFile });
    const fullRes: ToolResponse = JSON.parse(rawFull);
    expect(fullRes.toolStatus).toBe("success");
    expect(fullRes.outcome).toBe("success");
    expect(fullRes.data.content).toContain("1 | Alpha");
    expect(fullRes.data.content).toContain("5 | Epsilon");
    expect(fullRes.data.totalLines).toBe(5);

    // Read line slice 2 to 4
    const rawSlice = await readTool.execute({
      path: testFile,
      startLine: 2,
      endLine: 4,
    });
    const sliceRes: ToolResponse = JSON.parse(rawSlice);
    expect(sliceRes.toolStatus).toBe("success");
    expect(sliceRes.outcome).toBe("success");
    expect(sliceRes.data.content).not.toContain("1 | Alpha");
    expect(sliceRes.data.content).toContain("2 | Beta");
    expect(sliceRes.data.content).toContain("3 | Gamma");
    expect(sliceRes.data.content).toContain("4 | Delta");
    expect(sliceRes.data.content).not.toContain("5 | Epsilon");
    expect(sliceRes.data.startLine).toBe(2);
    expect(sliceRes.data.endLine).toBe(4);
  });

  it("editTool replaces unique substring correctly", async () => {
    const testFile = `${TEST_DIR}/code.ts`;
    await writeTool.execute({
      path: testFile,
      content: "const a = 1;\nconst b = 2;\nconst c = 3;",
    });

    const rawRes = await editTool.execute({
      path: testFile,
      oldString: "const b = 2;",
      newString: "const b = 42;",
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.data.message).toContain("Successfully applied 1 edit");
    const updated = await Bun.file(testFile).text();
    expect(updated).toBe("const a = 1;\nconst b = 42;\nconst c = 3;");
  });

  it("editTool returns structured mismatch errors if substring is missing or ambiguous with diagnostic data", async () => {
    const testFile = `${TEST_DIR}/duplicate.txt`;
    await writeTool.execute({
      path: testFile,
      content: "foo\nfoo\nbar",
    });

    // Missing substring
    const rawMissing = await editTool.execute({
      path: testFile,
      oldString: "baz",
      newString: "qux",
    });
    const missingRes: ToolResponse = JSON.parse(rawMissing);
    expect(missingRes.toolStatus).toBe("success");
    expect(missingRes.outcome).toBe("mismatch");
    expect(missingRes.data.occurrences).toBe(0);
    expect(missingRes.error?.message).toContain("oldString was not found");

    // Ambiguous substring (matches multiple times)
    const rawDup = await editTool.execute({
      path: testFile,
      oldString: "foo",
      newString: "replaced",
    });
    const dupRes: ToolResponse = JSON.parse(rawDup);
    expect(dupRes.toolStatus).toBe("success");
    expect(dupRes.outcome).toBe("mismatch");
    expect(dupRes.data.occurrences).toBe(2);
    expect(dupRes.error?.message).toContain("matched 2 occurrences");
  });

  it("editTool applies multiple targeted replacements across different sections of a file", async () => {
    const testFile = `${TEST_DIR}/multi_section.ts`;
    const initialContent = [
      "import { alpha } from './alpha';",
      "import { beta } from './beta';",
      "",
      "function compute() {",
      "  const x = 10;",
      "  return x + 5;",
      "}",
      "",
      "export const result = compute();",
    ].join("\n");

    await writeTool.execute({
      path: testFile,
      content: initialContent,
    });

    // Edit imports at the top AND compute function body at the bottom simultaneously
    const rawRes = await editTool.execute({
      path: testFile,
      edits: [
        {
          oldString: "import { beta } from './beta';",
          newString: "import { beta, gamma } from './beta';",
        },
        {
          oldString: "  const x = 10;\n  return x + 5;",
          newString: "  const x = 20;\n  return x + gamma();",
        },
      ],
    });

    const res: ToolResponse = JSON.parse(rawRes);
    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.data.editsApplied).toBe(2);

    const updatedContent = await Bun.file(testFile).text();
    expect(updatedContent).toContain("import { beta, gamma } from './beta';");
    expect(updatedContent).toContain("  const x = 20;\n  return x + gamma();");
    expect(updatedContent).toContain("import { alpha } from './alpha';");
    expect(updatedContent).toContain("export const result = compute();");
  });

  it("editTool matches all edits against original file and rejects overlapping or nested edits", async () => {
    const testFile = `${TEST_DIR}/overlap.ts`;
    await writeTool.execute({
      path: testFile,
      content: "function test() {\n  const a = 1;\n  const b = 2;\n  return a + b;\n}",
    });

    // 1. Overlapping edits
    const rawOverlap = await editTool.execute({
      path: testFile,
      edits: [
        {
          oldString: "  const a = 1;\n  const b = 2;",
          newString: "  const a = 100;\n  const b = 2;",
        },
        {
          oldString: "  const b = 2;\n  return a + b;",
          newString: "  const b = 200;\n  return a + b;",
        },
      ],
    });
    const overlapRes: ToolResponse = JSON.parse(rawOverlap);
    expect(overlapRes.toolStatus).toBe("success");
    expect(overlapRes.outcome).toBe("mismatch");
    expect(overlapRes.error?.message).toContain("overlap or are nested");
    expect(overlapRes.error?.message).toContain("merged together");

    // 2. Original file untouched after overlap mismatch
    const unchanged = await Bun.file(testFile).text();
    expect(unchanged).toContain("const a = 1;\n  const b = 2;");
  });

  it("globTool finds matching files with structured data payload, returning count 0 on empty without error", async () => {
    await writeTool.execute({ path: `${TEST_DIR}/a.ts`, content: "a" });
    await writeTool.execute({ path: `${TEST_DIR}/b.ts`, content: "b" });
    await writeTool.execute({ path: `${TEST_DIR}/c.json`, content: "{}" });

    const rawRes = await globTool.execute({
      pattern: "*.ts",
      path: TEST_DIR,
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.data.count).toBe(2);
    expect(res.data.matches).toContain("a.ts");
    expect(res.data.matches).toContain("b.ts");
    expect(res.data.matches).not.toContain("c.json");

    // Empty search should be outcome: "success" with count: 0
    const rawEmpty = await globTool.execute({
      pattern: "*.xyz",
      path: TEST_DIR,
    });
    const emptyRes: ToolResponse = JSON.parse(rawEmpty);
    expect(emptyRes.toolStatus).toBe("success");
    expect(emptyRes.outcome).toBe("success");
    expect(emptyRes.data.count).toBe(0);
    expect(emptyRes.data.matches).toEqual([]);
  });

  it("grepTool finds pattern matches with line numbers and structured objects", async () => {
    await writeTool.execute({
      path: `${TEST_DIR}/file1.txt`,
      content: "The quick brown fox\njumps over\nthe lazy dog",
    });
    await writeTool.execute({
      path: `${TEST_DIR}/file2.txt`,
      content: "No animals here\njust foxes playing",
    });

    const rawRes = await grepTool.execute({
      pattern: "fox",
      path: TEST_DIR,
      caseSensitive: false,
    });
    const res: ToolResponse = JSON.parse(rawRes);

    expect(res.toolStatus).toBe("success");
    expect(res.outcome).toBe("success");
    expect(res.data.count).toBe(2);
    expect(res.data.matches.some((m: any) => m.content.includes("quick brown fox"))).toBe(true);
    expect(res.data.matches.some((m: any) => m.content.includes("foxes playing"))).toBe(true);

    // 0 matches in grep returns outcome: "success" with count: 0
    const rawZero = await grepTool.execute({
      pattern: "nonExistent12345",
      path: TEST_DIR,
    });
    const zeroRes: ToolResponse = JSON.parse(rawZero);
    expect(zeroRes.toolStatus).toBe("success");
    expect(zeroRes.outcome).toBe("success");
    expect(zeroRes.data.count).toBe(0);
    expect(zeroRes.data.matches).toEqual([]);
  });

  it("deleteTool removes single files, rejects directories without recursive, and deletes recursively", async () => {
    // 1. Delete single file
    const sampleFile = `${TEST_DIR}/to_delete.txt`;
    await writeTool.execute({ path: sampleFile, content: "temporary content" });
    expect(existsSync(sampleFile)).toBe(true);

    const deleteFileRes: ToolResponse = JSON.parse(
      await deleteTool.execute({ path: sampleFile })
    );
    expect(deleteFileRes.toolStatus).toBe("success");
    expect(deleteFileRes.outcome).toBe("success");
    expect(deleteFileRes.data.targetType).toBe("file");
    expect(existsSync(sampleFile)).toBe(false);

    // 2. Delete non-existent path -> not_found
    const missingRes: ToolResponse = JSON.parse(
      await deleteTool.execute({ path: sampleFile })
    );
    expect(missingRes.toolStatus).toBe("success");
    expect(missingRes.outcome).toBe("not_found");

    // 3. Delete directory without recursive -> invalid_target
    const sampleDir = `${TEST_DIR}/nested_dir`;
    const nestedFile = `${sampleDir}/file.txt`;
    await writeTool.execute({ path: nestedFile, content: "nested" });
    expect(existsSync(sampleDir)).toBe(true);

    const dirWithoutRec: ToolResponse = JSON.parse(
      await deleteTool.execute({ path: sampleDir, recursive: false })
    );
    expect(dirWithoutRec.toolStatus).toBe("success");
    expect(dirWithoutRec.outcome).toBe("invalid_target");
    expect(dirWithoutRec.data.targetType).toBe("directory");
    expect(dirWithoutRec.error?.message).toContain("recursive: true");
    expect(existsSync(sampleDir)).toBe(true);

    // 4. Delete directory with recursive: true -> success
    const dirWithRec: ToolResponse = JSON.parse(
      await deleteTool.execute({ path: sampleDir, recursive: true })
    );
    expect(dirWithRec.toolStatus).toBe("success");
    expect(dirWithRec.outcome).toBe("success");
    expect(dirWithRec.data.targetType).toBe("directory");
    expect(existsSync(sampleDir)).toBe(false);

    // 5. Deleting workspace root or system root -> tool_error
    const rootRes: ToolResponse = JSON.parse(
      await deleteTool.execute({ path: "." })
    );
    expect(rootRes.toolStatus).toBe("tool_error");
    expect(rootRes.outcome).toBe("tool_error");
    expect(rootRes.error?.message).toContain("prohibited");
  });

  it("ToolRegistry registers tools and generates OpenAI JSON schemas", () => {
    const registry = new ToolRegistry(defaultTools);
    expect(registry.getAll().length).toBe(8);

    const openAITools = registry.toOpenAITools();
    expect(openAITools.length).toBe(8);
    expect(openAITools[0]?.type).toBe("function");
    expect(openAITools.map((t) => t.function.name)).toEqual([
      "skill_discovery",
      "bash",
      "glob",
      "grep",
      "read",
      "write",
      "edit",
      "delete",
    ]);
  });

  it("returns proper structured errors and diagnostic data when tools encounter invalid inputs", async () => {
    // 1. Calling read on a directory -> invalid_target
    mkdirSync(TEST_DIR, { recursive: true });
    const rawDir = await readTool.execute({ path: TEST_DIR });
    const dirRes: ToolResponse = JSON.parse(rawDir);
    expect(dirRes.toolStatus).toBe("success");
    expect(dirRes.outcome).toBe("invalid_target");
    expect(dirRes.data.targetType).toBe("directory");
    expect(dirRes.error?.message).toContain("directory");

    // 2. Calling read on non-existent file -> not_found
    const rawMissing = await readTool.execute({ path: `${TEST_DIR}/missing.txt` });
    const missingRes: ToolResponse = JSON.parse(rawMissing);
    expect(missingRes.toolStatus).toBe("success");
    expect(missingRes.outcome).toBe("not_found");

    // 3. Calling edit on non-existent file -> not_found
    const rawEditMissing = await editTool.execute({
      path: `${TEST_DIR}/nonexistent.txt`,
      oldString: "a",
      newString: "b",
    });
    const editMissingRes: ToolResponse = JSON.parse(rawEditMissing);
    expect(editMissingRes.toolStatus).toBe("success");
    expect(editMissingRes.outcome).toBe("not_found");

    // 4. Calling glob on a file instead of directory -> invalid_target
    await writeTool.execute({ path: `${TEST_DIR}/sample.txt`, content: "hello world" });
    const rawGlobFile = await globTool.execute({
      pattern: "*.txt",
      path: `${TEST_DIR}/sample.txt`,
    });
    const globFileRes: ToolResponse = JSON.parse(rawGlobFile);
    expect(globFileRes.toolStatus).toBe("success");
    expect(globFileRes.outcome).toBe("invalid_target");
    expect(globFileRes.data.targetType).toBe("file");

    // 5. Calling unrecognized tool name in registry -> tool_error
    const registry = new ToolRegistry(defaultTools);
    const rawUnrec = await registry.execute("list_files", { dir: "." });
    const unrecRes: ToolResponse = JSON.parse(rawUnrec);
    expect(unrecRes.toolStatus).toBe("tool_error");
    expect(unrecRes.outcome).toBe("tool_error");
    expect(unrecRes.error?.message).toContain("list_files");

    // 6. Calling a process/domain skill as a tool call -> tool_error + skill notice
    const rawSkillCall = await registry.execute("codebase_discovery", { focusArea: "src" });
    const skillCallRes: ToolResponse = JSON.parse(rawSkillCall);
    expect(skillCallRes.toolStatus).toBe("tool_error");
    expect(skillCallRes.outcome).toBe("tool_error");
    expect(skillCallRes.data.attemptedName).toBe("codebase_discovery");
    expect(skillCallRes.error?.message).toContain("process/domain skill");
  });

  it("createTool utility generates schema, validates required arguments, normalizes responses, and catches exceptions", async () => {
    // 1. Tool creation with required parameters
    const customTool = createTool({
      name: "custom_tester",
      description: "Testing createTool utility functionality.",
      parameters: {
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results" },
        },
        required: ["query"],
      },
      execute: async (args: { query: string; limit?: number }) => {
        if (args.query === "throw_error") {
          throw new Error("Simulated tool crash");
        }
        return {
          outcome: "success",
          data: { query: args.query, limit: args.limit ?? 10 },
        };
      },
    });

    // Check schema
    expect(customTool.name).toBe("custom_tester");
    expect(customTool.parameters.type).toBe("object");
    expect(customTool.parameters.required).toEqual(["query"]);

    // Missing required parameter -> tool_error
    const missingRes: ToolResponse = JSON.parse(await customTool.execute({ limit: 5 }));
    expect(missingRes.toolStatus).toBe("tool_error");
    expect(missingRes.outcome).toBe("tool_error");
    expect(missingRes.error?.type).toBe("validation_error");
    expect(missingRes.error?.message).toContain("'query' parameter is required for the custom_tester tool");

    // Success execution returning object -> wrapped via createToolResponse
    const successRes: ToolResponse = JSON.parse(await customTool.execute({ query: "hello", limit: 3 }));
    expect(successRes.toolStatus).toBe("success");
    expect(successRes.outcome).toBe("success");
    expect(successRes.data).toEqual({ query: "hello", limit: 3 });

    // Exception inside execute -> caught and wrapped as tool_invocation_error
    const crashRes: ToolResponse = JSON.parse(await customTool.execute({ query: "throw_error" }));
    expect(crashRes.toolStatus).toBe("tool_error");
    expect(crashRes.outcome).toBe("tool_error");
    expect(crashRes.error?.type).toBe("tool_invocation_error");
    expect(crashRes.error?.message).toContain("Simulated tool crash");
  });

  it("resolveToolPath and validateFileTarget handle paths and target validations consistently", () => {
    // resolveToolPath normalizes relative POSIX path
    const res = resolveToolPath("src/tools.ts");
    expect(res.relPath).toBe("src/tools.ts");
    expect(res.absPath).toContain("src");

    // validateFileTarget on existing file
    const targetFile = validateFileTarget("src/tools.ts", { toolName: "read" });
    expect(targetFile.ok).toBe(true);
    if (targetFile.ok) {
      expect(targetFile.exists).toBe(true);
      expect(targetFile.isDirectory).toBe(false);
    }

    // validateFileTarget on directory when not allowed
    const targetDir = validateFileTarget("src", { toolName: "read" });
    expect(targetDir.ok).toBe(false);
    if (!targetDir.ok) {
      const parsed: ToolResponse = JSON.parse(targetDir.response);
      expect(parsed.outcome).toBe("invalid_target");
      expect(parsed.data.targetType).toBe("directory");
    }

    // validateFileTarget on non-existent file
    const targetMissing = validateFileTarget("non_existent_file.xyz", { toolName: "edit" });
    expect(targetMissing.ok).toBe(false);
    if (!targetMissing.ok) {
      const parsed: ToolResponse = JSON.parse(targetMissing.response);
      expect(parsed.outcome).toBe("not_found");
    }
  });
});
