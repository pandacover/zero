---
name: validation_of_work
type: process_skill
description: Comprehensive verification procedures to validate changes, run test suites, check TypeScript types, and verify build integrity.
when_to_use:
  - After creating, updating, or refactoring code files.
  - Before concluding any task or reporting completion to the user.
  - Ensuring no type errors, syntax mistakes, or broken tests were introduced.
how_to_access: Read via skill_discovery({ skillName: "validation_of_work" }). Do NOT invoke as a tool.
tools_used:
  - bash
---

# Validation of Work Skill

Never mark a task complete without rigorous, multi-layer verification.

---

## ⚡ Core Principle: Consistent Clean Output Across Validation Checks

- An isolated single run might mask issues if a test target or configuration was missed.
- **Consistency is key**: When multiple complementary validation tools (e.g. `tsc --noEmit` returning exitCode 0 with no errors, test runner reporting 100% pass rate, and `git status` showing expected clean changes) **consistently confirm clean results**, that is **strong evidence of success**.
- If validation results consistently confirm success and match task expectations, proceed with the natural completion summary. If results contradict user prerequisites, directly ask the user.

---

## Validation Checklist:

### 1. Static Type Checking
- Run the TypeScript compiler with no emit via the `bash` tool to catch syntax and type errors:
  ```json
  bash({ "command": "bunx tsc --noEmit" })
  ```
- **Rule**: Exit code 0 with 0 errors printed confirms total type safety.

### 2. Automated Test Execution
- Run unit and integration tests via the `bash` tool:
  ```json
  bash({ "command": "bun test" })
  ```
- **Rule**: All tests must pass (100% pass rate, 0 failures). If a test fails, invoke the `debugging` skill to reproduce and fix it.

### 3. Build & Bundle Verification
- Run production build scripts via the `bash` tool if configured in `package.json`:
  ```json
  bash({ "command": "npm run build" })
  ```
- Verify the bundler finishes with exit code 0 and produces valid artifacts without bundle errors.

### 4. Git Diff & Change Sanity Check
- Check modified files via the `bash` tool and verify no unintended edits, leftover temporary debug logs, or syntax mistakes remain:
  ```json
  bash({ "command": "git status" })
  ```
