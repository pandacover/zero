---
name: read
type: tool
description: Read content of a file with line numbers, optionally specifying start and end lines.
when_to_use:
  - Inspecting source code, configuration files, or documentation.
  - Reading specific line ranges of large files to understand logic and context.
  - Verifying exact code structure and surrounding lines before making edits.
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

Use this tool to examine the contents of a specific file in the repository.

---

## 🛠️ Mechanical Recovery Protocol (MANDATORY on Read Failure)

- **If `outcome: "not_found"` (File does not exist)**:
  1. Do not repeat the same invalid path.
  2. Run `glob` with a wildcard pattern to find where the file actually lives:
     ```json
     glob({ "pattern": "**/*[filename]*" })
     ```
  3. Re-invoke `read` using the discovered valid path.

- **If `outcome: "invalid_target"` (Target is a directory, not a file)**:
  1. The path points to a directory. Use `glob` to list files inside that directory:
     ```json
     glob({ "path": "path/to/dir", "pattern": "*" })
     ```

- **If `outcome: "mismatch"` (startLine exceeds total lines)**:
  1. The file has fewer lines than requested (check `totalLines` in `data`).
  2. Call `read` without line bounds or with `startLine: 1` to inspect the full file.
