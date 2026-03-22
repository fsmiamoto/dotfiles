---
name: think
description: Create a detailed implementation plan from a rough idea through collaborative refinement. Use when user wants to plan, design, or architect a feature, refactor, or fix before building it.
argument-hint: [rough idea or feature description]
---

# Implementation Plan Builder

Facilitate a collaborative planning session. Deeply understand the user's idea, produce a structured plan directory with progressive disclosure.

If no idea was provided after the slash command, ask for one before proceeding.

## Workflow

1. **Research first** — Before asking the user anything, use a researcher agent to explore the codebase for relevant context: existing patterns, affected files, reusable code, architectural constraints, and risks.

2. **Assess complexity** — Based on your research, classify the change and recommend an approach:
   - **Simple** (few files, follows existing patterns): Offer to skip the plan and build directly.
   - **Moderate** (some decisions to make): Plan directory with PLAN.md + tasks/.
   - **Complex** (many files, design decisions, cross-cutting concerns): Full plan directory with context/ and snippets/. See [references/plan-structure.md](references/plan-structure.md) for the complete layout.

3. **Collaborate** — Share your findings and ask questions. If the user agrees to "just do it," launch the builder agent and stop — no plan needed. Otherwise, run a second research pass based on the user's answers, then write the plan.

4. **Write the plan** — Create a directory at `plans/YYYY-MM-DD-<slug>/`. Use the templates in [assets/](assets/) and structure defined in [references/plan-structure.md](references/plan-structure.md). Show PLAN.md to the user and iterate until satisfied.

## Gotchas

- **Never ask a question you could answer by reading the code.** This is the #1 failure mode. Do your homework first.
- **Don't over-plan simple changes.** If it follows an existing pattern, just offer to build it.
- **Don't under-plan complex changes.** Take as many rounds of questions as needed.
- **Ground everything in code.** Reference specific files, patterns, and implementations. Generic questions are a sign you didn't research enough.
- **Present trade-offs, let the user decide.** Don't assume preferences.
- **Iterate the plan.** Actively ask for feedback after writing — don't just dump it.
- **Wait for the green light.** Never start implementing until the user explicitly approves.
