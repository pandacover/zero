---
name: react
type: domain_skill
description: Domain skill for React component architecture, hooks best practices, JSX syntax, state management, and modern UI patterns.
when_to_use:
  - Building, modifying, or refactoring React components (.tsx, .jsx).
  - Designing custom React hooks, component hierarchies, or context providers.
  - Resolving React re-rendering issues, stale closures, or state bugs.
  - Integrating UI component libraries (Tailwind, Lucide icons, Framer Motion, Radix UI).
how_to_access: Read via skill_discovery({ skillName: "react" }). Do NOT invoke as a tool.
---

# React Domain Skill

> **Note**: This is a domain knowledge guideline. Do not invoke `react` as a tool call. Use tools like `read`, `write`, `edit`, and `bash`.

---

## Core Guidelines & Best Practices:

### 1. Functional Components & Typing
- Always write functional components with TypeScript:
  ```tsx
  interface ButtonProps {
    label: string;
    variant?: "primary" | "secondary";
    onClick?: () => void;
    disabled?: boolean;
  }

  export const Button: React.FC<ButtonProps> = ({ label, variant = "primary", onClick, disabled }) => {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`btn btn-${variant}`}
      >
        {label}
      </button>
    );
  };
  ```

### 2. Modern Hooks Rules
- **`useState`**: For local UI state. Keep state minimal and derive values whenever possible rather than duplicating state.
- **`useEffect`**: Use primarily for external synchronization (subscriptions, timers, DOM APIs). Avoid using effects for state synchronization.
- **`useMemo` & `useCallback`**: Use to memoize expensive computations or stable callback references passed to memoized children.
- **`useRef`**: For DOM references or mutable values that do not trigger re-renders.

### 3. JSX & HTML Hygiene
- Always close JSX self-closing tags explicitly (e.g. `<img />`, `<input />`, `<App />`).
- Ensure all elements in an array have unique and stable `key` props (never use random numbers or array indices if items can reorder).
- In TypeScript files with JSX, use `.tsx` extension and verify `tsconfig.json` has `"jsx": "react-jsx"`.

### 4. Component Structure & Separation of Concerns
- Keep components small and focused on a single responsibility.
- Separate presentational components from data-fetching/container logic.
- Place reusable components under `src/components/`, hooks in `src/hooks/`, and types in `src/types/`.
