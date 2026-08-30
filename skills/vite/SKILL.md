---
name: vite
type: domain_skill
description: Domain conventions, decision rules, and configuration patterns for Vite bundling, plugins, and development workflows.
when_to_use:
  - Configuring or modifying 'vite.config.ts' (plugins, aliases, dev server, build outputs).
  - Setting up module resolution, path aliases, environment variables, or asset handling.
  - Resolving bundling issues, asset import errors, or dev server proxy configurations.
how_to_access: Read via skill_discovery({ skillName: "vite" }). Do NOT invoke as a tool.
---

# Vite Domain Skill: Conventions & Decision Rules

This skill provides conventions and decision rules for configuring Vite build pipelines, module resolution, and asset workflows.

---

## 1. Module Resolution & Path Aliases Conventions

- **Synchronized Configuration Rule**:
  - Whenever you define a path alias in `vite.config.ts` (`resolve.alias`), you **must** synchronize the corresponding paths in `tsconfig.json` so that both the bundler and TypeScript type checker resolve imports identically:
    - **In `vite.config.ts`**:
      ```typescript
      resolve: {
        alias: {
          '@': resolve(__dirname, 'src'),
        },
      }
      ```
    - **In `tsconfig.json`**:
      ```json
      "compilerOptions": {
        "baseUrl": ".",
        "paths": {
          "@/*": ["src/*"]
        }
      }
      ```

---

## 2. Environment Variables & Security Rules

- **Client Exposure Rule**:
  - Only environment variables prefixed with `VITE_` (e.g. `VITE_API_URL`) are embedded into the client-side JavaScript bundle via `import.meta.env.VITE_*`.
  - **Security Rule**: Never prefix private API keys, database secrets, or sensitive tokens with `VITE_`. Those must remain on backend servers.
- **Type Declaration Convention**:
  - Add custom environment variable definitions to `src/vite-env.d.ts` for type safety:
    ```typescript
    /// <reference types="vite/client" />
    interface ImportMetaEnv {
      readonly VITE_API_URL: string;
    }
    ```

---

## 3. Asset Handling Decision Rules

| Asset Category | Where to Store | How to Reference | Bundler Behavior |
| :--- | :--- | :--- | :--- |
| **Static / Untouched** | `public/` directory (e.g. `favicon.ico`, `robots.txt`) | Root absolute path: `/favicon.ico` | Copied verbatim to `dist/` root without content hashing. |
| **Processed / Component Assets** | `src/assets/` (e.g. icons, logos, illustrations) | ESM import: `import logo from '@/assets/logo.svg'` | Inlined as Base64 (if small) or emitted with content hash for long-term caching. |
| **CSS / PostCSS Assets** | `src/styles/` | ESM import in entry: `import './styles/index.css'` | Processed through PostCSS/Tailwind pipeline and minified. |

---

## 4. Plugin & Build Optimization Rules

- **Plugin Ordering**: Framework plugins (like `@vitejs/plugin-react`) should generally precede transform and utility plugins.
- **Build Target**: Default to `"target": "esnext"` for modern evergreen browsers unless legacy browser polyfills are explicitly required.
