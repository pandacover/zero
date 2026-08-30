---
name: execute
type: process_skill
description: The core orchestration workflow to follow for every user task or query.
when_to_use:
  - Triggered on every user prompt, coding request, or task.
  - Guiding end-to-end task execution from understanding to exploration, implementation, validation, debugging, and summary.
how_to_access: Read via skill_discovery({ skillName: "execute" }). Do NOT invoke as a tool.
---

# Execute Workflow Skill

> **Note**: This is a process skill / guideline to follow mentally. Do not invoke `execute` as a tool call. Use callable tools (`skill_discovery`, `bash`, `glob`, `grep`, `read`, `write`, `edit`) to carry out each step.

---

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
- Read `skills/codebase_discovery/SKILL.md` via `skill_discovery({ skillName: "codebase_discovery" })`.
- Locate configuration manifests (`package.json`, `tsconfig.json`, `vite.config.ts`).
- Discover file layout and entry points using `glob` and `grep`.
- Read relevant lines with `read` to build a mental map of existing patterns before making changes.

### Step 3: Implement the Task
- Consult appropriate domain skills (`react`, `vite`, `typescript`) using `skill_discovery`.
- Apply minimal, surgical modifications using `edit`, or create clean new files with `write`.

### Step 4: Validate the Work (`validation_of_work`)
- Read `skills/validation_of_work/SKILL.md` via `skill_discovery({ skillName: "validation_of_work" })`.
- Run type checking: `bash({ command: "bunx tsc --noEmit" })`.
- Run automated tests: `bash({ command: "bun test" })` or `bash({ command: "npm test" })`.
- Check build integrity: `bash({ command: "npm run build" })`.

### Step 5: Debug if Errors Occur (`debugging`)
- **Core Principle**: *"Every bug is hiding in plain sight, and if you cannot reproduce it you have not fixed it."*
- Read `skills/debugging/SKILL.md` via `skill_discovery({ skillName: "debugging" })`.
- Reproduce the exact error with a command or script before changing code.
- Apply targeted fixes and loop back to **Step 4: Validate Work** until all checks pass cleanly.

### Step 6: Summarise the Work
- Provide a concise, professional summary of:
  1. What changes were made.
  2. What files were created or modified.
  3. Validation results (tests passed, type checks passed, build succeeded).
