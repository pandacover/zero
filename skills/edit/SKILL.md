---
name: edit
type: tool
description: Perform one or more targeted replacements within a single file. Supports editing multiple sections at once.
when_to_use:
  - Making targeted, surgical modifications to one or more sections of an existing file without rewriting the entire file.
  - Adding imports at the top and updating a function at the bottom simultaneously.
  - Refactoring specific functions, classes, variables, or configuration blocks in a single file.
parameters:
  path:
    type: string
    description: Path to the file to edit.
    required: true
  edits:
    type: array
    description: List of targeted replacements ({ oldString, newString }) to apply across different sections of the file.
    required: false
  oldString:
    type: string
    description: The exact substring to replace (shorthand for single edit).
    required: false
  newString:
    type: string
    description: The replacement content (shorthand for single edit).
    required: false
---

# Edit Skill

Use the `edit` tool to make surgical, targeted modifications to an existing file without rewriting the entire file. Supports editing a single section or multiple sections of a file in a single call.

---

## ⚡ Core Rules for Multi-Section Editing

1. **One Path, Multiple Targeted Replacements**:
   - When modifying multiple locations within a single file (e.g. adding imports at the top and changing logic at the bottom), provide a list of edits under `edits`:
     ```json
     edit({
       "path": "src/App.tsx",
       "edits": [
         {
           "oldString": "import { useState } from 'react';",
           "newString": "import { useState, useEffect } from 'react';"
         },
         {
           "oldString": "function App() {\n  return <div>Hello</div>;\n}",
           "newString": "function App() {\n  useEffect(() => {}, []);\n  return <div>Hello World</div>;\n}"
         }
       ]
     })
     ```

2. **Matched Against the Original File (NOT Incrementally)**:
   - Every `oldString` in the `edits` list is matched against the **original, unmodified file content** simultaneously, not sequentially/incrementally.
   - You do not need to account for preceding replacements when writing subsequent `oldString` snippets.

3. **No Overlapping or Nested Edits**:
   - Edits must target disjoint, non-overlapping regions of the file.
   - **Merge Overlaps**: If two intended changes overlap or are nested within the same lines/block, merge them together into a **single edit block**.

4. **Avoid Connecting Distant Changes with Large Unchanged Blocks**:
   - **Do NOT** include dozens of lines of unchanged code just to connect distant edits.
   - Instead, split them into distinct, targeted entries in the `edits` array.

---

## 🛠️ Mechanical Recovery Protocol (MANDATORY on Edit Failure)

If an `edit` tool call fails with `outcome: "mismatch"` (e.g. `oldString was not found`, `matched multiple occurrences`, or `overlapping edits`):

1. **DO NOT RETRY BLINDLY**: Never guess whitespace, indentation, or lines, and never retry the exact same `edit` without inspecting the file.
2. **IMMEDIATE RECOVERY ACTION**: Call the `read` tool on the target file around the lines you intend to edit:
   ```json
   read({ "path": "path/to/file.ts", "startLine": 20, "endLine": 45 })
   ```
3. **OBSERVE EXACT CONTENT**: Copy the exact characters, indentation spaces/tabs, and line endings as shown in the `read` tool output into your `oldString`.
4. **RESOLVE AMBIGUITY**: If the failure was due to multiple occurrences (`occurrences > 1`), expand the `oldString` to include 1–2 surrounding unique lines of context above and below the change.
5. **MERGE OVERLAPS**: If the failure reported overlapping edits, combine the overlapping regions into a single `oldString`/`newString` pair.
6. **EXECUTE RECOVERED EDIT**: Call the `edit` tool with the confirmed exact substrings.
