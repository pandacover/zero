---
name: debugging
type: process_skill
description: Systematic process for reproducing, isolating, and fixing bugs. Every bug is hiding in plain sight; if you cannot reproduce it, you have not fixed it.
when_to_use:
  - Investigating test failures, build errors, type errors, or runtime exceptions.
  - Resolving unexpected behavior, state inconsistencies, or styling regressions.
  - Diagnosing broken features or misbehaving API integrations.
how_to_access: Read via skill_discovery({ skillName: "debugging" }). Do NOT invoke as a tool.
tools_used:
  - bash
  - read
  - grep
  - edit
---

# Debugging Skill

> *"Every bug is hiding in plain sight, and if you cannot reproduce it you have not fixed it."*
> **Note**: This is a process guideline. Do not call `debugging` as a tool call. Use tools like `bash`, `read`, `grep`, and `edit`.

---

## 4-Stage Debugging Protocol:

### Stage 1: Reproduce the Bug (MANDATORY FIRST STEP)
- Before modifying ANY code, construct a reliable reproduction:
  - Run the failing unit test: `bash({ command: "bun test <test_name>" })`
  - Run the typechecker or linter: `bash({ command: "bunx tsc --noEmit" })`
  - Create a minimal test file or script in `tests/` that consistently reproduces the exact failure.
- If you cannot reproduce the bug, you do not yet understand the problem.

### Stage 2: Isolate Root Cause
- Read the full stack trace and error message carefully.
- Use `read` with line numbers to examine the exact lines and surrounding scope where the failure occurred.
- Check data assumptions:
  - Are variables `null` or `undefined`?
  - Are asynchronous operations resolving out of order?
  - Is there a type mismatch or missing import?
- Use `grep` to check if similar errors exist elsewhere or where the failing symbol is referenced.

### Stage 3: Apply Surgical Fix
- Make the minimal necessary change to resolve the root cause using `edit`.
- Do not introduce unrelated refactorings while debugging.
- Preserve existing logic, types, and comments.

### Stage 4: Verify the Fix
- Re-run the reproduction test/command: confirm it now passes cleanly.
- Run the full test suite and type checker to ensure no regressions were introduced:
  `bash({ command: "bunx tsc --noEmit; bun test" })`
