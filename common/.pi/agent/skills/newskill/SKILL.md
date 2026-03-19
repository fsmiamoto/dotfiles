---
name: newskill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing Skills

## Process

1. **Understand the need** — Ask what task/domain the skill covers and its key use cases.
2. **Draft the skill** — Create the skill following the guidelines below.
3. **Review with user** — Present draft, iterate until satisfied.

## A Skill Is a Folder

```
skill-name/
├── SKILL.md           # Main instructions (required, under 100 lines)
├── references/        # API signatures, schemas, detailed docs (read on demand)
├── assets/            # Templates, config files (copied/used during execution)
└── scripts/           # Utility scripts (deterministic operations)
```

Use progressive disclosure: keep SKILL.md focused, point to reference files for details.

## Writing SKILL.md

### Frontmatter

Required fields: `name` (lowercase, hyphens, must match directory), `description` (max 1024 chars).

### The Description Is for Triggering

The description is **the only thing the agent sees** when deciding which skill to load.

- First sentence: what capability this provides
- Include "Use when..." with specific triggers, keywords, file types

### Focus on What the Model Doesn't Know

The model already knows how to code. Tell it what's *different*:

- **Gotchas** — Common failure points, edge cases, footguns. The highest-signal content.
- **Scope & guardrails** — What's in/out of scope, what to never do.
- **Pointers to references** — "See [references/api.md](references/api.md) for signatures."

Don't include step-by-step instructions the model would figure out, generic coding advice, or information derivable from the codebase.

## Gotchas

- Name must match parent directory exactly (lowercase, hyphens only, no leading/trailing/consecutive hyphens)
- Skills without a description are silently skipped
- SKILL.md over 100 lines is a sign content should move to reference files
- Pi skills follow the [Agent Skills standard](https://agentskills.io/specification)
- Global skills go in `~/.pi/agent/skills/` or `~/.agents/skills/`, project skills in `.pi/skills/` or `.agents/skills/`

## Review Checklist

- [ ] Description includes "Use when..." triggers
- [ ] SKILL.md under 100 lines
- [ ] Has a gotchas section
- [ ] Focuses on what the model wouldn't already know
- [ ] Detail split into reference files
