---
name: glob
description: Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*', '*.json').
tool: glob
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

Use this skill/tool when you need to discover files or directory structures matching specific glob patterns across the project.

## When to use:
- Finding where files of a certain type are located (e.g., `**/*.test.ts`, `**/*.json`).
- Checking if specific config or source files exist in the project.
- Exploring project layout and subdirectories.

## Example usage:
- `glob({ pattern: "**/*.ts" })`
- `glob({ pattern: "*.json", path: "src" })`
