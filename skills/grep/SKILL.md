---
name: grep
description: Search for a regex or text pattern across files with line numbers and snippets.
tool: grep
parameters:
  pattern:
    type: string
    description: Regular expression or text pattern to search for.
    required: true
  path:
    type: string
    description: Directory or file to search in (defaults to '.').
    required: false
  include:
    type: string
    description: Optional file glob filter to narrow search (e.g. '*.ts', '*.json').
    required: false
  caseSensitive:
    type: boolean
    description: Whether the search is case-sensitive (defaults to false).
    required: false
---

# Grep Skill

Use this skill/tool to search for exact strings, identifiers, functions, classes, imports, or regular expressions across project source code.

## When to use:
- Finding all usages, declarations, or references of a function or class.
- Searching for specific error messages or log strings.
- Locating configuration keys across multiple files.

## Example usage:
- `grep({ pattern: "interface Message" })`
- `grep({ pattern: "import.*from", include: "*.ts" })`
