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
  - git
---

# Validation of Work Skill

> **Note**: This is a process guideline. Do not invoke `validation_of_work` as a tool call. Use the `bash` tool to run verification commands (`tsc`, `bun test`, `npm run build`).

---

## Validation Checklist:

### 1. Static Type Checking
- Run the TypeScript compiler with no emit to catch syntax and type errors:
  ```bash
  bash({ command: "bunx tsc --noEmit" })
  # or
  bash({ command: "npx tsc --noEmit" })
  ```
- **Rule**: All type errors must be resolved with 0 errors before proceeding.

### 2. Automated Test Execution
- Run unit and integration tests:
  ```bash
  bash({ command: "bun test" })
  # or
  bash({ command: "npm test" })
  ```
- **Rule**: All tests must pass (100% pass rate). If a test fails, invoke the `debugging` skill to reproduce and fix it.

### 3. Build & Bundle Verification
- Run production build scripts if configured in `package.json`:
  ```bash
  bash({ command: "npm run build" })
  # or
  bash({ command: "bun run build" })
  ```
- Verify the bundler finishes with exit code 0 and produces valid artifacts without bundle errors.

### 4. Git Diff & Change Sanity Check
- Check modified files and verify no unintended edits, leftover temporary debug logs, or syntax mistakes remain:
  ```bash
  bash({ command: "git status" })
  ```
