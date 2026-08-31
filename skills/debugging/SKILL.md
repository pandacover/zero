---
name: debugging
type: process_skill
description: Systematic process for reproducing, isolating, and fixing bugs, with deterministic mechanical recovery for tool failures.
when_to_use:
  - Investigating test failures, build errors, type errors, or runtime exceptions.
  - Recovering deterministically when an 'edit', 'read', 'delete', or 'bash' tool call fails.
  - Resolving unexpected behavior, state inconsistencies, or styling regressions.
how_to_access: Read via skill_discovery({ skillName: "debugging" }). Do NOT invoke as a tool.
tools_used:
  - bash
  - read
  - grep
  - edit
  - glob
  - delete
---

# Debugging Skill: Protocol & Mechanical Recovery

> *"Every bug is hiding in plain sight, and if you cannot reproduce it you have not fixed it."*

---

## 🛠️ Mechanical Tool Recovery Matrix (MANDATORY on Tool Failures)

When any tool execution fails, follow this deterministic recovery protocol before retrying:

| Failed Tool Call | Failure Reason | Deterministic Mechanical Recovery Action |
| :--- | :--- | :--- |
| **`edit`** | `outcome: "mismatch"` (`oldString not found` or `matched N occurrences`) | **DO NOT GUESS OR RETRY BLINDLY.** Immediately call the `read` tool: `read({ path, startLine, endLine })` on the target region to inspect current lines and whitespace. Copy the exact code into `oldString` (expanding lines if ambiguous) and retry calling the `edit` tool. |
| **`read`** | `outcome: "not_found"` | Call the `glob` tool: `glob({ pattern: "**/*<name>*" })` to discover the correct file location before re-invoking the `read` tool. |
| **`read`** | `outcome: "invalid_target"` (directory) | Call the `glob` tool: `glob({ path: targetDir, pattern: "*" })` to view directory contents. |
| **`delete`** | `outcome: "invalid_target"` (directory) | Re-invoke the `delete` tool with `recursive: true`: `delete({ path, recursive: true })`. |
| **`bash`** | `exitCode != 0` (Type / Compile error) | Read the exact file and line number cited in compiler error output by calling the `read` tool before attempting an edit. |
| **`bash`** | `exitCode != 0` (Missing script/binary) | Call the `read` tool: `read({ path: "package.json" })` to inspect defined `scripts` and installed `dependencies`. |
| **`write`** | `outcome: "invalid_target"` (directory conflict) | Call the `glob` tool to verify directory structure and specify the exact target filename. |

---

## 4-Stage Debugging Protocol:

### Stage 1: Reproduce the Bug (MANDATORY FIRST STEP)
- Before modifying ANY code, construct a reliable reproduction:
  - Run the failing unit test via the `bash` tool: `bash({ command: "bun test <test_name>" })`
  - Run the typechecker or linter via the `bash` tool: `bash({ command: "bunx tsc --noEmit" })`
  - Create a minimal test file or script in `tests/` that consistently reproduces the exact failure.
- If you cannot reproduce the bug, you do not yet understand the problem.

### Stage 2: Isolate Root Cause
- Read the full stack trace and error message carefully.
- Call the `read` tool with line numbers to examine the exact lines and surrounding scope where the failure occurred.
- Check data assumptions:
  - Are variables `null` or `undefined`?
  - Are asynchronous operations resolving out of order?
  - Is there a type mismatch or missing import?
- Call the `grep` tool to check if similar errors exist elsewhere or where the failing symbol is referenced.

### Stage 3: Apply Surgical Fix
- Make the minimal necessary change to resolve the root cause using the `edit` tool.
- If `edit` fails, apply the **Mechanical Tool Recovery** rule above (Call the `read` tool $\rightarrow$ copy exact snippet $\rightarrow$ call the `edit` tool).
- Do not introduce unrelated refactorings while debugging.
- Preserve existing logic, types, and comments.

### Stage 4: Verify the Fix
- Re-run the reproduction test/command via the `bash` tool: confirm it now passes cleanly.
- Call the `grep` tool to verify zero remaining occurrences of the bug.
- Run the full test suite and type checker via the `bash` tool to ensure no regressions were introduced:
  `bash({ command: "bunx tsc --noEmit; bun test" })`
