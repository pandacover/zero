---
name: codebase_discovery
type: process_skill
description: Systematic process for navigating, mapping, and understanding project architecture, entry points, and dependencies before making changes.
when_to_use:
  - Exploring an unfamiliar or newly opened project.
  - Locating where specific features, modules, components, or state stores are defined.
  - Checking project configuration, scripts, build pipeline, and dependency setup.
  - Mapping out the architectural mental model before implementing a task.
how_to_access: Read via skill_discovery({ skillName: "codebase_discovery" }). Do NOT invoke as a tool.
tools_used:
  - glob
  - grep
  - read
---

# Codebase Discovery Skill

> **Note**: This is a process guideline. Do not call `codebase_discovery` as a tool call. Use tools like `glob`, `grep`, and `read` to explore the project.

---

## ⚡ The 3-Time Consistency Rule for Empty Codebases

> **CRITICAL RULE (3-TIME CHECK)**:
> If discovery tools execute successfully **3 times** and return **0 files consistently across all 3 calls** (e.g. `glob({ pattern: "**/*" })`, `glob({ pattern: "*" })`, `glob({ pattern: "src/**/*" })` all return `count: 0`), treat the codebase as **100% conclusively empty**.
>
> **Do NOT loop or continue searching beyond 3 empty results.** Proceed immediately according to the task intent:
>
> 1. **Path A (Scaffolding / New Project Creation)**:
>    - If the user's prompt is to build, initialize, create, or scaffold a project or feature, immediately proceed with the **natural course of action** (e.g. creating files using `write`, scaffolding directory structure, creating `package.json`).
> 2. **Path B (Existing Project Expected)**:
>    - If the user's prompt explicitly requested modifying, refactoring, or debugging an existing codebase that was assumed to exist, stop exploring and directly explain to the user that the directory is empty and ask for guidance.

---

## 4-Step Discovery Process:

### 1. Inspect Project Manifests & Configs
- Use `glob({ pattern: "**/*" })` to check existing files. If 3 checks consistently show 0 files, apply the 3-Time Consistency Rule above (proceed with scaffolding or ask user).
- Read `package.json` with `read` to understand dependencies, frameworks, scripts, and runtime environment.
- Read `tsconfig.json` to understand TypeScript compiler options, target, paths, and module resolution.
- Read build tool configs (`vite.config.ts`, `next.config.js`, etc.) to understand bundling and path aliases.

### 2. Map Directory Structure
- Use `glob({ pattern: "**/*" })` or `glob({ pattern: "src/**/*" })` to get an overview of the directory tree.
- Note standard directory conventions (e.g. `src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, `tests/`).

### 3. Identify Entry Points & Flow
- Find the root entry file (`src/index.ts`, `src/main.tsx`, `src/App.tsx`, etc.).
- Trace how components and modules are wired together from entry point down to leaf modules.

### 4. Locate Key Architecture Patterns & State
- Use `grep` to find how state is managed (e.g., React Context, Redux, Zustand, React Query).
- Find reusable UI components, styling strategies (Tailwind, CSS Modules, Styled Components), and utility helpers.
- Use `read` with line numbers to study existing patterns and match naming/code conventions.
