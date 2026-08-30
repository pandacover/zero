---
name: write
type: tool
description: Create or completely overwrite a file with specified content. Creates directories automatically.
when_to_use:
  - Creating brand new source code files, tests, scripts, or documentation.
  - Completely rewriting or replacing the entire content of an existing file.
  - Setting up new configuration files or artifacts from scratch.
parameters:
  path:
    type: string
    description: Path to the file to write.
    required: true
  content:
    type: string
    description: The full content to write to the file.
    required: true
---

# Write Skill

Use this skill/tool to create new files or completely overwrite existing files.

## When to use:
- Creating new source code files, tests, scripts, or documentation.
- Writing complete replacement implementations.
- Setting up configuration files or artifacts.

## Example usage:
- `write({ path: "src/utils.ts", content: "export const add = (a: number, b: number) => a + b;\n" })`
