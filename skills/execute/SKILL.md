---
name: execute
description: The core orchestration workflow to follow for every user task or query.
tool: skill_discovery
when_to_use:
  - Triggered on every user prompt, coding request, or task.
  - Guiding end-to-end task execution from understanding to exploration, implementation, validation, debugging, and summary.
parameters:
  task:
    type: string
    description: The user task or objective to execute.
    required: true
---

# Execute Workflow Skill

This skill defines the mandatory execution loop for every query and task handled by the agent.

## The Execution Loop:

```
[1. Understand Task]
        ↓
[2. Explore Codebase]  ──(use "codebase_discovery", "glob", "grep", "read")
        ↓
[3. Implement]         ──(use domain skills: "react", "vite", "typescript", "edit", "write")
        ↓
[4. Validate Work]     ──(use "validation_of_work", "bash")
        ↓
   Errors found? ──YES──→ [5. Debug] ──(use "debugging": reproduce first! -> fix)
        │                       │
        NO                      └─→ (Back to Step 4: Validate Work)
        ↓
[6. Summarise Work]
```

---

### Step 1: Understand the Task
- Before running modifying tools, carefully analyze the user's intent, constraints, and success criteria.
- Identify which technologies and domain skills will be relevant (e.g., React, Vite, TypeScript).

### Step 2: Explore the Codebase (`codebase_discovery`)
- Locate configuration manifests (`package.json`, `tsconfig.json`, `vite.config.ts`).
- Discover file layout and entry points using `glob` and `grep`.
- Read relevant lines with `read` to build a mental map of existing patterns before making changes.

### Step 3: Implement the Task
- Use appropriate domain skills (`react`, `vite`, `typescript`).
- Apply minimal, surgical modifications using `edit`, or create clean new files with `write`.

### Step 4: Validate the Work (`validation_of_work`)
- Run type checking (e.g. `bash({ command: "bunx tsc --noEmit" })`).
- Run automated tests (e.g. `bash({ command: "bun test" })` or `bash({ command: "npm test" })`).
- Check build integrity (e.g. `bash({ command: "npm run build" })`).

### Step 5: Debug if Errors Occur (`debugging`)
- **Core Principle**: *"Every bug is hiding in plain sight, and if you cannot reproduce it you have not fixed it."*
- Reproduce the exact error with a command or script before changing code.
- Apply targeted fixes and loop back to **Step 4: Validate Work** until all checks pass cleanly.

### Step 6: Summarise the Work
- Provide a concise, professional summary of:
  1. What changes were made.
  2. What files were created or modified.
  3. Validation results (tests passed, type checks passed, build succeeded).
