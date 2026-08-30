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

## ⚡ Core Principle: Empty Output is Strong Evidence of State, NOT Failure

> **CRITICAL RULE**: An empty or zero-count tool output (e.g. `matches: []`, `count: 0`) is **strong, conclusive evidence of accurate state observation, NOT an error or failure**.
>
> - When `glob({ pattern: "**/*" })` returns `matches: []` with `count: 0`, this conclusively proves that the current working directory is a **clean, empty workspace ready for project initialization**. Do NOT assume the tool malfunctioned or that files are hidden. Proceed directly with creating the project structure or files.
> - When `glob` or `grep` returns 0 matches for a specific filename or symbol, it confirms that the target file/symbol does not exist in the searched path.

---

## 4-Step Discovery Process:

### 1. Inspect Project Manifests & Configs
- Use `glob({ pattern: "**/*" })` to check existing files. If `count: 0`, conclude immediately that the directory is empty and proceed with project scaffolding.
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
