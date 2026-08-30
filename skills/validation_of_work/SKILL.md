---
name: validation_of_work
description: Comprehensive verification procedures to validate changes, run test suites, check TypeScript types, and verify build integrity.
tool: skill_discovery
when_to_use:
  - After creating, updating, or refactoring code files.
  - Before concluding any task or reporting completion to the user.
  - Ensuring no type errors, syntax mistakes, or broken tests were introduced.
parameters:
  scope:
    type: string
    description: Optional validation scope (e.g., 'typecheck', 'tests', 'build', 'all').
    required: false
---

# Validation of Work Skill

Never mark a task complete without rigorous, multi-layer verification.

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
