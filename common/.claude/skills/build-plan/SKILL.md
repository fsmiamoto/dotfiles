---
name: build-plan
description: Create a structured implementation plan from conversation context. Produces a plan with tracer-bullet vertical slices.
argument-hint: [rough idea or feature description]
---

# Implementation Plan Builder

Turn the current conversation context into a structured plan directory with vertical-slice tasks.

If no idea was provided and there's no relevant conversation context, ask for one before proceeding.

## Workflow

1. **Research (conditional)** — If the codebase hasn't been explored in this conversation, run a researcher agent to find relevant context: existing patterns, affected files, reusable code, architectural constraints. Skip if already done (e.g., from a prior /discuss session).

2. **Synthesize** — From the conversation context, draft a proposed plan structure and present it:
   - Problem/solution summary
   - Key decisions (with trade-offs)
   - Out of scope
   - Milestones with one-line demoable description each
   - Tasks per milestone: title, HITL/AFK designation, blocked-by relationships
   - Human checkpoints per milestone

3. **Iterate** — User reviews the breakdown: split, merge, reorder, change HITL/AFK, adjust scope. Single review checkpoint — not open-ended questioning.

4. **Write the plan** — Once approved, create directory at `plans/YYYY-MM-DD-<slug>/` using the templates in [assets/](assets/). Show PLAN.md to the user and iterate until satisfied.

## Gotchas

- **Never ask a question you could answer by reading the code.** Do your homework first.
- **Don't re-interview the user.** The conversation context has the answers. Synthesize, don't interrogate.
- **Ground everything in code.** Reference specific files, patterns, and implementations.
- **Don't pre-write the implementation.** Brief a competent teammate — what/where/surface, not function bodies.
- **Think in vertical slices.** The litmus test: "can someone run this and see it working?"
- **Present trade-offs, let the user decide.**
- **Iterate the plan.** Actively ask for feedback after writing.
- **Wait for the green light.** Never start implementing until the user explicitly approves.
