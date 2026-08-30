---
name: vite
type: domain_skill
description: Domain skill for Vite build tool configuration, plugins, development server, path aliases, environment variables, and production bundling.
when_to_use:
  - Configuring or modifying 'vite.config.ts' or 'vite.config.js'.
  - Setting up Vite plugins (e.g. '@vitejs/plugin-react', tailwind, svgr).
  - Configuring path aliases (e.g. '@/*' pointing to 'src/*').
  - Debugging bundling, dev server proxy, or static asset issues.
how_to_access: Read via skill_discovery({ skillName: "vite" }). Do NOT invoke as a tool.
---

# Vite Domain Skill

> **Note**: This is a domain knowledge guideline. Do not invoke `vite` as a tool call. Use tools like `read`, `write`, `edit`, and `bash`.

---

## Standard `vite.config.ts` Setup:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
  },
});
```

---

## Key Vite Conventions:

1. **Path Aliases**:
   - When adding an alias in `vite.config.ts` (`@` -> `src`), also add the matching `paths` mapping in `tsconfig.json`:
     ```json
     {
       "compilerOptions": {
         "baseUrl": ".",
         "paths": {
           "@/*": ["src/*"]
         }
       }
     }
     ```
2. **Environment Variables**:
   - Access client-side env vars using `import.meta.env.VITE_*`.
   - Variables without `VITE_` prefix are intentionally excluded from client bundles for security.
3. **HTML Entry**:
   - Vite uses `index.html` at the project root (not in `public/`) as the entry point, which imports `<script type="module" src="/src/main.tsx"></script>`.
