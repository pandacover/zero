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

Use this tool to make surgical, targeted modifications to an existing file without rewriting the entire file.

---

## 🛠️ Mechanical Recovery Protocol (MANDATORY on Edit Failure)

If an `edit` call fails with `outcome: "mismatch"` (either `oldString was not found` or `matched multiple occurrences`):

1. **DO NOT RETRY BLINDLY**: Never guess whitespace, indentation, or lines, and never retry the exact same `edit` without inspecting the file.
2. **IMMEDIATE RECOVERY ACTION**: Call `read` on the target file around the lines you intend to edit:
   ```json
   read({ "path": "path/to/file.ts", "startLine": 20, "endLine": 45 })
   ```
3. **OBSERVE EXACT CONTENT**: Copy the exact characters, indentation spaces/tabs, and line endings as shown in the `read` output into your new `oldString`.
4. **RESOLVE AMBIGUITY**: If the failure was due to multiple occurrences (`occurrences > 1`), expand the `oldString` to include 1–2 surrounding unique lines of context above and below the change.
5. **EXECUTE RECOVERED EDIT**: Perform the updated `edit` with the confirmed exact substring.
