---
name: glob
type: tool
description: Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*', '*.json').
when_to_use:
  - Discovering files or directory layout matching specific filename patterns (e.g. '**/*.test.ts', '**/*.json').
  - Checking if specific configuration or source files exist in the project.
  - Exploring project subdirectories and directory structure.
parameters:
  pattern:
    type: string
    description: The glob pattern to search for (e.g., '**/*.ts', 'src/*', '*.json').
    required: true
  path:
    type: string
    description: Base directory to search within (defaults to current working directory '.').
    required: false
---

# Glob Skill

Use this tool when you need to discover files or directory structures matching specific glob patterns across the project.

---

## 🛠️ Mechanical Recovery Protocol (on Unexpected Output or Errors)

- **If `outcome: "invalid_target"` (Target is a file, not a directory)**:
  - You passed a file path to `path`. If you meant to read the file, call `read({ path })`. If you meant to search the file's parent folder, pass `dirname(path)` to `path`.
- **If `outcome: "not_found"` (Base directory does not exist)**:
  - Check `glob({ pattern: "*" })` from the root `.` to verify valid top-level directories.
- **If 0 matches returned (`count: 0`) when searching for a known file**:
  - Broaden the pattern (e.g. from `src/*.ts` to `**/*.ts` or `**/*<keyword>*`) to catch nested subfolders.
