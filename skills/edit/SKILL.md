---
name: edit
type: tool
description: Replace an exact substring within an existing file with new content.
when_to_use:
  - Making targeted, surgical modifications to an existing file without rewriting the whole file.
  - Updating or refactoring a specific function, class, variable, or statement.
  - Adding imports, fixing a bug, or updating specific configuration settings.
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
