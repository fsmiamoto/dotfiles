---
name: prd
description: Generates a Product Requirements Document from a rough product idea. Use when the user invokes /prd, says "write a PRD", "create requirements", or wants to turn a rough idea into structured product requirements. Takes the idea as an argument.
user_invocable: true
arguments:
  - name: idea
    description: The rough product idea or feature description
    required: true
---

# PRD Generator

Takes a rough idea and produces a structured PRD saved to `docs/prds/`.

## Process

1. Read the idea from the argument or ask for it.
2. Do some research either on the current codebase or on the web related to the topic.
3. Ask meaningful clarifying questions to fill gaps (target users, constraints, success metrics, scope boundaries) — use AskUserQuestion
3. Generate the PRD using the template at [assets/template.md](assets/template.md)
4. Create `docs/prds/` if it doesn't exist
5. Save to `docs/prds/<slug>.md` where `<slug>` is kebab-case derived from the idea
6. Present a brief summary of what was generated and the file path

## Gotchas

- **Do your homework** If you can answer something by doing research, then do it
- **Don't skip clarification.** A rough idea always has ambiguity. Ask before writing — a bad PRD is worse than no PRD.
- **Don't invent metrics.** If the user doesn't specify success criteria, ask — don't fabricate KPIs.
- **Don't scope-creep.** The PRD reflects the user's idea, not an expanded vision. Keep scope tight to what was described.
- **Non-functional requirements are easy to forget.** Prompt for performance, security, and accessibility if the idea implies a user-facing product.
- **Never overwrite an existing PRD** without confirming with the user first.
- **Date:** always use the current date from context, not a placeholder.

## Guardrails

- Output is always a markdown file in `docs/prds/`
- Keep PRDs concise — aim for 1-3 pages, not a novel
- Use plain language — avoid jargon the target audience wouldn't use
- Every section in the template should have real content or be explicitly marked N/A with a reason — no empty sections
