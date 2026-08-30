---
name: codebase_discovery
description: Systematic process for navigating, mapping, and understanding project architecture, entry points, and dependencies before making changes.
tool: skill_discovery
when_to_use:
  - Exploring an unfamiliar or newly opened project.
  - Locating where specific features, modules, components, or state stores are defined.
  - Checking project configuration, scripts, build pipeline, and dependency setup.
  - Mapping out the architectural mental model before implementing a task.
parameters:
  focusArea:
    type: string
    description: Optional specific area or component to focus exploration on.
    required: false
---

# Codebase Discovery Skill

A disciplined process for exploring and understanding the structure and conventions of a codebase before writing or modifying code.

## 4-Step Discovery Process:

### 1. Inspect Project Manifests & Configs
- Read `package.json` to understand dependencies, frameworks, scripts, and runtime environment.
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
