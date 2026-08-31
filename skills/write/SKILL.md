---
name: write
type: tool
description: Create or completely overwrite a file with specified content. Creates directories automatically.
when_to_use:
  - Creating new source files, test files, configuration files, or documentation.
  - Fully replacing an entire file when wholesale rewriting is cleaner than multiple granular edits.
  - Bootstrapping initial project structure or boilerplate.
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

Use the `write` tool to create new files or completely overwrite existing files.

---

## 🛠️ Mechanical Recovery Protocol (on Write Errors)

- **If `outcome: "invalid_target"` (Target is an existing directory)**:
  - The path provided matches an existing directory. Check the desired filename (e.g. call the `write` tool with `path: "src/components/Button/index.tsx"` instead of `"src/components/Button"`).
- **If write fails due to permissions or lock**:
  - Verify that the path is within the workspace root and that no background process has locked the file.
