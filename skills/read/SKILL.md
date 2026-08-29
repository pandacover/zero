---
name: read
description: Read content of a file with line numbers, optionally specifying start and end lines.
tool: read
parameters:
  path:
    type: string
    description: Path to the file to read.
    required: true
  startLine:
    type: number
    description: 1-indexed starting line number (optional).
    required: false
  endLine:
    type: number
    description: 1-indexed ending line number (inclusive, optional).
    required: false
---

# Read Skill

Use this skill/tool to examine the contents of a specific file in the repository.

## When to use:
- Inspecting source code, configuration files, or logs.
- Reading specific line ranges (e.g. lines 10 to 50) of large files to save context.
- Verifying code structure before making edits.

## Example usage:
- `read({ path: "src/index.ts" })`
- `read({ path: "src/agent.ts", startLine: 1, endLine: 50 })`
