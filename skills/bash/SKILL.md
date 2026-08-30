---
name: bash
type: tool
description: Execute shell commands sandboxed within the project workspace directory. File creation and editing via bash is prohibited (use 'write' or 'edit' instead).
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

---

## ⛔ Strict Constraint: No File Creation or Editing via Bash

- **Do NOT use `bash` to create or edit files.**
- Commands such as `echo "..." > file`, `echo "..." >> file`, `cat << EOF > file`, `touch file`, `tee file`, or `sed -i` are **strictly prohibited** in the `bash` tool.
- **Dedicated Tools**:
  - To create or overwrite a file: Use the **`write`** tool.
  - To modify an existing file: Use the **`edit`** tool.
- Attempting to create or modify files via `bash` will fail execution and direct you to the `write` or `edit` tool.

---

## 🛠️ Mechanical Recovery Protocol (MANDATORY on Command Failure)

If a `bash` command fails (`outcome: "failure"` or non-zero exit code):

1. **Compilation / Type Error (`tsc`)**:
   - Inspect the exact file path and line number reported in `stdout`/`stderr`.
   - Call `read` on that specific file and line range to view the error context before applying fixes.
2. **Test Failure (`bun test`, `npm test`)**:
   - Do not re-run tests in a loop without editing code.
   - Read the failing test assertion and stack trace. Locate the failing code with `read`, apply the surgical fix with `edit`, then re-run the test.
3. **Missing Command or Script Error**:
   - If an `npm run <script>` fails with script missing, call `read({ path: "package.json" })` to check the actual available `scripts` and `dependencies`.
4. **Timeout (`outcome: "timeout"`)**:
   - If a test suite or build takes longer than 30s, specify an increased `timeoutMs` parameter:
     ```json
     bash({ "command": "bun test", "timeoutMs": 60000 })
     ```
