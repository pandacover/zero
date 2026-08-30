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

Never mark a task complete without rigorous, multi-layer verification.

---

## ⚡ Core Principle: Empty Output is Strong Evidence of Success, NOT Failure

> **CRITICAL RULE**: In validation and compilation tools, an empty error stream (`stderr: ""`, no errors printed, exit code 0) is **the strongest possible evidence of success, NOT a malfunction**.
>
> - When `bash({ command: "bunx tsc --noEmit" })` finishes with exit code 0 and empty output, it means **zero type errors exist in the codebase**. This is the definition of complete type safety.
> - When `bash({ command: "git status" })` shows working tree clean, it confirms no unstaged or rogue modifications exist.

---

## Validation Checklist:

### 1. Static Type Checking
- Run the TypeScript compiler with no emit to catch syntax and type errors:
  ```bash
  bash({ command: "bunx tsc --noEmit" })
  # or
  bash({ command: "npx tsc --noEmit" })
  ```
- **Rule**: Exit code 0 with 0 errors printed confirms total type safety.

### 2. Automated Test Execution
- Run unit and integration tests:
  ```bash
  bash({ command: "bun test" })
  # or
  bash({ command: "npm test" })
  ```
- **Rule**: All tests must pass (100% pass rate, 0 failures). If a test fails, invoke the `debugging` skill to reproduce and fix it.

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
