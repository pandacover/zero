---
name: execute
type: process_skill
description: The core orchestration workflow to follow for every user task or query, including 3-time consistency checks and deterministic tool error recovery.
when_to_use:
  - Triggered on every user prompt, coding request, or task.
  - Guiding end-to-end task execution from understanding to exploration, implementation, validation, debugging, and summary.
how_to_access: Read via skill_discovery({ skillName: "execute" }). Do NOT invoke as a tool.
---

# Execute Workflow Skill

> **Note**: This is a process skill / guideline to follow mentally. Do not invoke `execute` as a tool call. Use callable tools (`skill_discovery`, `bash`, `glob`, `grep`, `read`, `write`, `edit`) to carry out each step.

---

## ⚡ Core Principles: 3-Time Consistency & Mechanical Recovery

1. **3-Time Consistency Rule for Empty State**:
   - If discovery tools execute successfully **3 times** and return 0 files consistently across all 3 calls (`count: 0`), treat the codebase as **100% conclusively empty**.
   - **Do NOT loop indefinitely or keep searching.** Proceed immediately:
     - *Proceed with Natural Next Steps*: If creating or initializing a project/component, immediately start creating files with `write`.
     - *Ask the User*: If modifying an existing codebase was expected, explain the empty state and ask for the correct path or guidance.
2. **Mechanical Tool Recovery**:
   - When an `edit` fails (`outcome: "mismatch"`): **Immediately `read` the target file region before retrying.** Never blindly re-attempt `edit`.
   - When a `read` fails with `not_found`: Use `glob` to find the correct file path.
   - When a `bash` command fails: Read the failing lines or `package.json` before retrying.

---

## The Execution Loop:

```
[1. Understand Task]
        ↓
[2. Explore Codebase]  ──(use "codebase_discovery", "glob", "grep", "read")
        ↓
[3. Implement]         ──(use domain conventions: "react", "vite", "typescript", "edit", "write")
        ↓
[4. Validate Work]     ──(use "validation_of_work", "bash")
        ↓
   Errors found? ──YES──→ [5. Debug] ──(use "debugging": reproduce first! -> fix -> mechanical recovery)
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
- Run `glob({ pattern: "**/*" })`. If 3 checks consistently show 0 files, apply the **3-Time Consistency Rule** (proceed with project creation if new project, or ask user if existing project expected).
- If files exist, locate configuration manifests (`package.json`, `tsconfig.json`, `vite.config.ts`) and entry points.
- Read relevant lines with `read` to build a mental map of existing patterns before making changes.

### Step 3: Implement the Task
- Consult appropriate domain conventions (`react`, `vite`, `typescript`) using `skill_discovery`.
- Apply minimal, surgical modifications using `edit`, or create clean new files with `write`.
- **Mechanical Recovery**: If `edit` fails, invoke `read` on the target lines before retrying.

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
