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

Skills are not just markdown files. The folder structure *is* context engineering.

```
skill-name/
├── SKILL.md           # Main instructions (required, under 100 lines)
├── references/        # API signatures, schemas, detailed docs (read on demand)
├── assets/            # Templates, config files (copied/used during execution)
└── scripts/           # Utility scripts (deterministic operations)
```

Use progressive disclosure: keep SKILL.md focused, point to reference files for details. Split when SKILL.md exceeds 100 lines or has distinct domains.

## Writing SKILL.md

### The Description Is for Triggering

The description is **the only thing the agent sees** when deciding which skill to load. Write it for matching, not summarizing.

- Max 1024 chars, third person
- First sentence: what capability this provides
- Include "Use when..." with specific triggers, keywords, file types

### Focus on What Claude Doesn't Know

Claude already knows how to code. Tell it what's *different* about your context:

- **Gotchas** — The highest-signal content in any skill. Common failure points, edge cases, footguns. Build this up over time as Claude hits new issues.
- **Scope & guardrails** — What's in/out of scope, what to never do.
- **Pointers to references** — "See [references/api.md](references/api.md) for signatures."

Don't include step-by-step instructions Claude would figure out on its own, generic coding advice, or information derivable from the codebase.

### Scripts & Code

Add scripts when operations are deterministic, would be generated repeatedly, or need explicit error handling. For data/analysis skills, include composable helper functions Claude can chain together.

### Hooks

Skills can register hooks that activate only when the skill is invoked. Use for opinionated behavior that shouldn't run all the time (e.g., blocking edits outside a specific directory).

### Memory & State

Skills can store data between runs (logs, JSON, SQLite). Previous results help the model stay consistent. If the skill needs user-specific setup (channels, credentials), store it in a `config.json` and prompt for it when missing.

## Review Checklist

- [ ] Description includes "Use when..." triggers
- [ ] SKILL.md under 100 lines
- [ ] Has a gotchas section
- [ ] Focuses on what Claude wouldn't already know
- [ ] Detail split into reference files
