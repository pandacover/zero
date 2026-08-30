---
name: bash
type: tool
description: Execute shell commands sandboxed within the project workspace directory.
when_to_use:
  - Running build commands (e.g. 'npm run build', 'vite build', 'bun build').
  - Running test suites (e.g. 'bun test', 'npm test', 'vitest', 'jest').
  - Running type checks and linters (e.g. 'bunx tsc --noEmit', 'eslint .').
  - Checking version control status and diffs (e.g. 'git status', 'git diff').
  - Installing or managing dependencies (e.g. 'bun add', 'npm install').
parameters:
  command:
    type: string
    description: The shell command line string to execute inside the project workspace.
    required: true
  timeoutMs:
    type: number
    description: Optional timeout in milliseconds (defaults to 30000ms).
    required: false
---

# Bash Skill

Use the `bash` tool to execute terminal commands sandboxed to the project's root directory.

## Sandboxing & Safety Rules:
- Commands always execute with the project's workspace directory as `cwd`.
- Do not run interactive commands that wait indefinitely for user stdin without flags.
- Avoid commands that modify files outside the workspace.
- Long-running processes are automatically terminated when `timeoutMs` expires.

## Common Command Patterns:
- **Typecheck**: `bash({ command: "bunx tsc --noEmit" })` or `bash({ command: "npx tsc --noEmit" })`
- **Run Tests**: `bash({ command: "bun test" })` or `bash({ command: "npm test" })`
- **Build Project**: `bash({ command: "npm run build" })`
- **Git Status**: `bash({ command: "git status" })`
