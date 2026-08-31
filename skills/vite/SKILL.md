---
name: vite
type: domain_skill
description: Domain conventions, architectural principles, and decision rules for Vite build configuration, module resolution, and project workflows.
when_to_use:
  - Scaffolding or configuring a Vite project.
  - Setting up module resolution, path aliases, environment variables, or asset handling.
  - Resolving bundling issues, dev server setup, or build pipeline configurations.
how_to_access: Read via skill_discovery({ skillName: "vite" }). Do NOT invoke as a tool.
---

# Vite Domain Skill: Conventions & Decision Rules

This skill provides generic, version-agnostic conventions and decision frameworks for configuring Vite build pipelines, module resolution, and asset workflows.

---

## 1. Project Scaffolding
- When initializing a new project in an empty workspace, use the scaffolding command (such as `npx create vite`) via the `bash` tool.
- Select the appropriate template matching the project's target framework and language requirements.
- After scaffolding, install the project dependencies and verify the workspace configuration before adding features.

---

## 2. Module Resolution & Path Aliases
- **Synchronization Invariant**:
  - Whenever path aliases are configured in the bundler configuration (`resolve.alias`), the identical mappings must be reflected in the TypeScript configuration (`tsconfig.json` paths).
  - Both the bundler (runtime module resolution) and TypeScript (type checking) must resolve aliases to the same underlying directories.
- Keep aliases clear and minimal to avoid circular dependency resolution issues.

---

## 3. Environment Variables & Security Boundary
- **Client vs. Server Separation**:
  - Only environment variables explicitly designated with the framework's client prefix are exposed to client-side code at build time.
  - **Security Rule**: Sensitive secrets, database credentials, and private API keys must never use client-exposed prefixes, as all client variables are embedded into public JavaScript bundles.
- Keep client environment variable declarations typed to ensure compile-time verification across the application.

---

## 4. Asset Handling Principles
- **Static Assets (Public Directory)**:
  - Assets that should be served untouched without transformation, hashing, or bundling belong in the dedicated public directory and are referenced via absolute root paths.
- **Processed Assets (Source Assets)**:
  - Assets that require optimization, inlining, or content-hashing for cache busting belong in the source tree and should be imported directly in module code.
- **Stylesheet Assets**:
  - Stylesheets should be imported through module entry points to allow the bundler's CSS processing pipeline to handle minification and post-processing.

---

## 5. Build & Plugin Pipeline Strategy
- **Plugin Ordering**: Framework-specific language/compiler plugins should execute before general utility or transformation plugins.
- **Build Verification**: Validate build outputs using the project's defined build script, ensuring exit code 0 and clean asset generation.
