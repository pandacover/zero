---
name: skill_discovery
description: Discover and inspect available skills and tools along with their YAML front-matter, parameters, and metadata.
tool: skill_discovery
when_to_use:
  - Discovering what tools and skills are available in the current workspace or global configuration.
  - Inspecting specific skill requirements, parameters, and usage instructions.
  - Deciding which process or domain skill to apply for a user task.
parameters:
  skillName:
    type: string
    description: Optional skill name to inspect a specific skill (e.g., 'codebase_discovery', 'debugging', 'validation_of_work', 'react', 'vite', 'typescript', 'bash', 'glob', 'grep', 'read', 'write', 'edit'). If omitted, lists all skills.
    required: false
---

# Skill Discovery

Use this tool/skill to discover all capabilities available to the agent, including core tools, process skills, and domain skills.

## When to use:
- At the start of a complex task to check available skills and domain guidelines.
- To inspect parameter requirements or instructions for a specific skill.

## Example usage:
- `skill_discovery({})` -> Lists all available skills and tools.
- `skill_discovery({ skillName: "debugging" })` -> Shows the debugging skill details.
- `skill_discovery({ skillName: "react" })` -> Shows the React domain skill details.
