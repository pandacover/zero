---
name: typescript
type: domain_skill
description: Domain conventions, type system decision rules, strictness guidelines, and compilation safety patterns for TypeScript.
when_to_use:
  - Designing types, interfaces, discriminated unions, or generic utilities.
  - Making decisions between 'type' vs 'interface', generics vs concrete types.
  - Resolving complex compiler errors, type widening, or strict null check issues.
  - Setting up or tuning 'tsconfig.json' compiler options.
how_to_access: Read via skill_discovery({ skillName: "typescript" }). Do NOT invoke as a tool.
---

# TypeScript Domain Skill: Conventions & Decision Rules

This skill provides conventions, type system decision frameworks, and idiomatic patterns for writing maintainable, type-safe TypeScript code.

---

## 1. `interface` vs. `type` Decision Framework

| Criterion | Use `interface` | Use `type` |
| :--- | :--- | :--- |
| **Primary Purpose** | Defining object models, component props, and extensible public API shapes. | Defining unions, intersections, primitives, tuples, function signatures, and utility mapped types. |
| **Extensibility** | Supports declaration merging and `extends` syntax. | Static and cannot be reopened. |
| **Examples** | `interface UserConfig { ... }`<br>`interface ButtonProps { ... }` | `type Status = "idle" \| "active" \| "error";`<br>`type Nullable<T> = T \| null;` |

> **Decision Rule**: Default to `interface` for object structures and component props; use `type` for unions, primitives, and complex type transformations.

---

## 2. Type Narrowing & Discrimination Rules

- **Prefer Discriminated Unions over Loose Optional Fields**:
  - When a data structure has mutually exclusive states, use a discriminant literal property (e.g. `type` or `status`):
    ```typescript
    type AsyncResult<T> =
      | { status: "success"; data: T }
      | { status: "error"; error: Error };
    ```
- **Avoid `any` — Use `unknown` with Narrowing**:
  - `any` disables all compiler safety checks and propagates unsoundness.
  - Use `unknown` for data from external APIs, JSON parsing, or user input, and narrow with type guards (`typeof`, `instanceof`, or custom `is` predicates) before accessing properties.

---

## 3. Strictness & Null Safety Conventions

1. **Nullish Coalescing (`??`) vs Logical OR (`||`)**:
   - Always use `??` when providing fallback defaults for nullable values (`value ?? defaultValue`) to preserve valid falsy values (`0`, `""`, `false`).
2. **Optional Chaining (`?.`)**:
   - Use optional chaining for nested properties that might be null or undefined.
3. **Non-Null Assertions (`!`)**:
   - Avoid `!` assertions unless immediately preceded by a runtime assertion or guard.

---

## 4. Compiler Safety & Verification

- Always verify changes with `bash({ command: "bunx tsc --noEmit" })`.
- Ensure `tsconfig.json` maintains `"strict": true`, `"noImplicitAny": true`, and `"strictNullChecks": true`.
