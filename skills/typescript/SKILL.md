---
name: typescript
type: domain_skill
description: Domain conventions, type system decision rules, strictness guidelines, and compilation safety patterns for TypeScript.
when_to_use:
  - Designing types, interfaces, discriminated unions, or generic utilities.
  - Making decisions between 'type' vs 'interface', generics vs concrete types.
  - Resolving complex compiler errors, type widening, or strict null check issues.
  - Setting up or tuning compiler options.
how_to_access: Read via skill_discovery({ skillName: "typescript" }). Do NOT invoke as a tool.
---

# TypeScript Domain Skill: Conventions & Decision Rules

This skill provides generic, version-agnostic conventions, type system decision frameworks, and idiomatic patterns for writing maintainable, type-safe TypeScript code.

---

## 1. `interface` vs. `type` Decision Framework

| Criterion | Use `interface` | Use `type` |
| :--- | :--- | :--- |
| **Primary Purpose** | Defining object models, component props, and extensible public API shapes. | Defining unions, intersections, primitives, tuples, function signatures, and utility mapped types. |
| **Extensibility** | Supports declaration merging and inheritance via `extends`. | Fixed type aliases; cannot be reopened or merged. |

> **Decision Rule**: Default to `interface` for object structures and component props; use `type` for unions, primitives, and complex type transformations.

---

## 2. Type Narrowing & Discrimination Rules

- **Prefer Discriminated Unions over Loose Optional Fields**:
  - When a data structure represents mutually exclusive states or operations, model it with a discriminant literal property to enable exhaustive type narrowing.
- **Avoid `any` — Use `unknown` with Narrowing**:
  - `any` disables compiler safety checks and propagates unsoundness across the codebase.
  - Use `unknown` for data from external APIs, serialized payloads, or user input, and narrow with type guards or assertions before accessing members.

---

## 3. Strictness & Null Safety Conventions

1. **Nullish Coalescing (`??`) vs Logical OR (`||`)**:
   - Use `??` when providing fallback defaults for nullable values to preserve valid falsy values (`0`, `""`, `false`).
2. **Optional Chaining (`?.`)**:
   - Use optional chaining for nested properties that can be null or undefined.
3. **Non-Null Assertions (`!`)**:
   - Avoid non-null assertions unless immediately preceded by a runtime validation check.

---

## 4. Compiler Safety & Verification

- Always verify code modifications by running the project's type checker via the `bash` tool.
- Maintain strict type checking compiler options (such as strict mode, strict null checks, and no implicit any) to ensure robust type coverage.
