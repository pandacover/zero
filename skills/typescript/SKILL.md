---
name: typescript
description: Domain skill for TypeScript strict typing, tsconfig.json configuration, TSX syntax, interfaces, generics, and compiler safety.
tool: skill_discovery
when_to_use:
  - Designing types, interfaces, enums, unions, or generic utility functions.
  - Setting up or tuning 'tsconfig.json' compiler options.
  - Resolving TypeScript compilation errors, type mismatches, or missing definitions.
  - Enforcing strict null checks and eliminating unsafe 'any' assertions.
parameters:
  topic:
    type: string
    description: Optional TypeScript topic (e.g., 'types', 'tsconfig', 'generics', 'strict', 'tsx').
    required: false
---

# TypeScript Domain Skill

Standards and best practices for robust, strict-mode TypeScript development.

---

## Recommended `tsconfig.json` Configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Core TypeScript Rules:

1. **Avoid `any`**:
   - Use `unknown` for values with unknown shape at compile-time and narrow with type guards.
   - Use proper generic type parameters `<T>` for reusable abstractions.
2. **Explicit Interfaces for Public Contracts**:
   - Use `interface` or `type` for all function arguments, props, and API response structures.
3. **Strict Null & Undefined Checks**:
   - Explicitly handle nullable values using optional chaining (`obj?.prop`) and nullish coalescing (`value ?? defaultValue`).
4. **Validation Command**:
   - Always run `bash({ command: "bunx tsc --noEmit" })` to verify complete type safety.
