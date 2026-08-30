---
name: react
type: domain_skill
description: Domain conventions, decision rules, and architecture patterns for React and TypeScript applications.
when_to_use:
  - Designing or refactoring React components, hooks, and component hierarchies.
  - Making architectural decisions around state management, effects, and composition.
  - Resolving re-rendering issues, stale closures, or event handling patterns.
how_to_access: Read via skill_discovery({ skillName: "react" }). Do NOT invoke as a tool.
---

# React Domain Skill: Conventions & Decision Rules

This skill provides architectural conventions and decision frameworks for writing idiomatic, robust React applications. Use these guidelines to make informed engineering choices.

---

## 1. State Architecture Decision Rules

| State Type | When to Use | How to Implement |
| :--- | :--- | :--- |
| **Local UI State** | State isolated to a single component (e.g. open dropdown, active tab, form inputs). | `useState` or `useReducer` for complex transitions. |
| **Derived State** | Values that can be computed from existing props or state. | **Do NOT put in state.** Compute inline during render, or wrap with `useMemo` only if computation is measurably expensive. |
| **Lifted State** | State needed by two or more sibling components. | Lift state up to their closest common ancestor and pass via props. |
| **Global / Shared State** | App-wide cross-cutting state (auth user, theme, global notifications). | React Context for low-frequency updates; external stores (Zustand, Redux) for high-frequency updates. |
| **Server Cache State** | Data fetched from backend APIs. | React Query / SWR / cache layer instead of manual `useEffect` + `useState` fetching. |

> **Golden Rule**: Never duplicate or sync state that can be derived synchronously during render.

---

## 2. Effects vs. Event Handlers Decision Rules

- **User Actions $\rightarrow$ Event Handlers**:
  - Network requests, form submissions, navigation, or state updates triggered by user clicks or keypresses **belong in event handlers** (e.g. `handleSubmit`, `onClick`).
  - *Anti-pattern*: Setting a state flag in an event handler just to trigger a `useEffect`.
- **External System Sync $\rightarrow$ `useEffect`**:
  - Use `useEffect` **only** to synchronize the component with external systems (e.g. DOM event listeners, WebSockets, third-party non-React widgets, timers).
  - Always return a cleanup function to prevent memory leaks and dangling subscriptions.

---

## 3. Component Decomposition & Composition Conventions

1. **Composition over Deep Prop Drilling**:
   - Prefer passing components as `children` or render props rather than passing data down 4+ levels.
2. **Container / Presentational Boundaries**:
   - Keep presentational components pure (props in, JSX out) and decoupled from data fetching.
   - Colocate stateful controller/container logic in custom hooks (`use[FeatureName]`).
3. **List Keys Convention**:
   - Always use unique, stable entity IDs for `key` props (e.g. `<Item key={item.id} />`).
   - Never use array indices as keys if items can be reordered, inserted, or filtered.

---

## 4. TypeScript & React Typing Conventions

- **Props Interface**: Define explicit interface named `[ComponentName]Props`:
  ```tsx
  interface UserCardProps {
    user: User;
    onSelect?: (userId: string) => void;
    className?: string;
  }
  ```
- **Event Handler Types**: Use standard React synthetic event types (`React.MouseEvent<HTMLButtonElement>`, `React.ChangeEvent<HTMLInputElement>`).
- **Refs**: Explicitly type DOM refs (`useRef<HTMLInputElement | null>(null)`).
