---
name: grep
type: tool
description: Search for a regex or text pattern across files with line numbers and snippets.
when_to_use:
  - Finding where a specific function, class, variable, or error string is used.
  - Locating architectural patterns, imports, exports, or CSS class names.
  - Checking if deprecated patterns or bugs remain anywhere in the codebase.
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
    type: string
    description: Whether the search is case-sensitive (defaults to false).
    required: false
---

# Grep Skill

Use this tool to search for text or regex patterns across files with line numbers and snippets.

---

## 🛠️ Mechanical Recovery Protocol (on Grep Results)

- **If 0 matches returned (`count: 0`) unexpectedly**:
  1. Ensure `caseSensitive` is `false` (default) if casing might differ.
  2. Simplify the regex pattern (avoid over-constraining with exact whitespace if formatting might vary across files).
  3. If searching a subfolder, broaden `path` to `"."`.
- **If too many matches returned**:
  1. Use `include` parameter (e.g. `include: "*.tsx"` or `include: "src/**/*"`) to filter by relevant file types.
