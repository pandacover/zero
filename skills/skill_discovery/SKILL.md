---
name: skill_discovery
type: tool
description: Discover and inspect available skills and tools along with their YAML front-matter, parameters, and metadata. Supports fetching multiple skills simultaneously.
when_to_use:
  - Discovering what tools and skills are available in the current workspace or global configuration.
  - Inspecting single or multiple skill requirements, parameters, and usage instructions at once.
  - Deciding which process or domain skills to apply for a user task.
parameters:
  skillNames:
    type: array
    description: Optional list of skill names to inspect multiple skills simultaneously (e.g. ['react', 'vite', 'typescript']).
    required: false
  skillName:
    type: string
    description: Optional single skill name (or comma-separated names) to inspect (e.g., 'debugging' or 'react, vite'). If omitted and skillNames is omitted, lists all skills.
    required: false
---

# Skill Discovery

Use this tool to discover all capabilities available to the agent, including core tools, process skills, and domain skills. Supports fetching single or multiple skills in a single call.

---

## When to use:
- At the start of a task to check available skills and domain guidelines.
- To inspect parameter requirements or instructions for one or more skills at once.

---

## Example usage:
- **List All Available Skills & Tools**:
  ```json
  skill_discovery({})
  ```
- **Fetch Multiple Skills Simultaneously**:
  ```json
  skill_discovery({ "skillNames": ["react", "vite", "typescript"] })
  ```
- **Fetch a Single Skill**:
  ```json
  skill_discovery({ "skillName": "debugging" })
  ```
