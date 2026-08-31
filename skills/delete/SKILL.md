---
name: delete
type: tool
description: Delete a file or directory on the filesystem.
when_to_use:
  - Removing obsolete, temporary, or unwanted files.
  - Deleting directories or build output folders.
  - Cleaning up test artifacts, unused modules, or deprecated components.
parameters:
  path:
    type: string
    description: Path to the file or directory to delete.
    required: true
  recursive:
    type: boolean
    description: Set to true when deleting a directory (defaults to false).
    required: false
---

# Delete Skill

Use this tool to permanently remove a file or directory from the workspace.

---

## Safety & Decision Rules:

1. **Directories Require `recursive: true`**:
   - To delete a single file: `delete({ path: "src/oldFile.ts" })`.
   - To delete a directory and its contents: `delete({ path: "src/oldDir", recursive: true })`.
2. **Workspace Root Protection**:
   - The workspace root directory and filesystem root cannot be deleted.
3. **Verify Before Deletion**:
   - When deleting source files, verify with `glob` or `grep` that no other modules or imports depend on the target before deleting.

---

## 🛠️ Mechanical Recovery Protocol (on Delete Errors)

- **If `outcome: "invalid_target"` (`'path' is a directory. Set 'recursive: true'...`)**:
  - The target path is a directory. Re-invoke `delete` with `recursive: true`:
    ```json
    delete({ "path": "path/to/dir", "recursive": true })
    ```
- **If `outcome: "not_found"`**:
  - The path does not exist. Use `glob` to verify if the file was already deleted or moved.
