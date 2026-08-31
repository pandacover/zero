---
name: react
type: domain_skill
description: Domain conventions, decision rules, and architectural patterns for React and TypeScript applications.
when_to_use:
  - Designing or refactoring React components, hooks, and component hierarchies.
  - Making architectural decisions around state management, effects, and composition.
  - Resolving re-rendering issues, stale closures, or event handling patterns.
how_to_access: Read via skill_discovery({ skillName: "react" }). Do NOT invoke as a tool.
---

# React Domain Skill: Conventions & Decision Rules

This skill provides generic, version-agnostic architectural conventions and decision frameworks for writing idiomatic, maintainable React applications.

---

## 1. State Architecture Decision Rules

| State Type | When to Use | How to Implement |
| :--- | :--- | :--- |
| **Local UI State** | State isolated to a single component (e.g. open dropdown, active tab, form inputs). | Component local state or reducer for complex transitions. |
| **Derived State** | Values that can be computed from existing props or state. | **Do NOT store in state.** Compute inline during render, memoizing only if computation is measurably expensive. |
| **Lifted State** | State needed by two or more sibling components. | Lift state up to their closest common ancestor and pass via props. |
| **Global / Shared State** | App-wide cross-cutting state (auth user, theme, global notifications). | Context for low-frequency updates; external stores for high-frequency updates. |
| **Server Cache State** | Data fetched from backend APIs. | Dedicated cache/query layer instead of manual effect-based fetching. |

> **Golden Rule**: Never duplicate or synchronize state that can be derived synchronously during render.

---

## 2. Effects vs. Event Handlers Decision Rules

- **User Actions $\rightarrow$ Event Handlers**:
  - Network requests, form submissions, navigation, or state updates triggered by user interaction belong in event handlers.
  - *Anti-pattern*: Setting state flags in event handlers solely to trigger an effect.
- **External System Synchronization $\rightarrow$ Effects**:
  - Use effects **only** to synchronize the component with external systems (e.g. DOM event listeners, WebSockets, external subscriptions, timers).
  - Always clean up subscriptions and event listeners to prevent memory leaks.

---

## 3. Component Decomposition & Composition Conventions

1. **Composition over Deep Prop Drilling**:
   - Prefer component composition (passing components as children or slots) over drilling props across deep component trees.
2. **Container vs. Presentational Boundaries**:
   - Keep presentational components pure (props in, JSX out) and decoupled from data fetching.
   - Colocate stateful controller logic in custom hooks.
3. **List Keys Convention**:
   - Always use unique, stable entity identifiers for list item keys.
   - Avoid array indices as keys when items can be reordered, inserted, or filtered.

---

## 4. Component Typing Conventions

- **Component Props**: Define explicit prop interfaces with clear types for children, event callbacks, and optional presentation classes.
- **Event Handler Typing**: Type event callbacks with framework event definitions matching the element and interaction type.
- **Ref Typing**: Explicitly type element and mutable refs to ensure compile-time null safety.
