---
name: edit
description: Replace an exact substring within an existing file with new content.
tool: edit
parameters:
  path:
    type: string
    description: Path to the file to edit.
    required: true
  oldString:
    type: string
    description: The exact substring to replace (must match characters and whitespace exactly).
    required: true
  newString:
    type: string
    description: The replacement content.
    required: true
---

# Edit Skill

Use this skill/tool to make surgical, targeted modifications to an existing file without rewriting the entire file.

## When to use:
- Refactoring or updating a specific function, class, or variable.
- Adding a single import statement or updating a configuration line.
- Fixing a specific bug or syntax error.

## Example usage:
- `edit({ path: "src/config.ts", oldString: "const port = 3000;", newString: "const port = 8080;" })`
