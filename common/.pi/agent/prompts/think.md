---
description: Create a detailed implementation plan from a rough idea through collaborative refinement
---
# Implementation Plan Builder

Facilitate a collaborative planning session. Deeply understand the user's idea, then produce a well-structured plan saved as a markdown file.

$ARGUMENTS

If no idea was provided, ask for one before proceeding.

## Workflow

1. **Research first** — Before asking the user anything, explore the codebase for relevant context: existing patterns, affected files, reusable code, architectural constraints, and risks.

2. **Assess complexity** — Based on your research, classify the change and recommend an approach:
   - **Simple** (few files, follows existing patterns): Offer to skip the plan and build directly.
   - **Moderate** (some decisions to make): Light plan with a few tasks, then build.
   - **Complex** (many files, design decisions, cross-cutting concerns): Full planning workflow with targeted follow-up research.

3. **Collaborate** — Share your findings and ask questions. If the user agrees to "just do it," implement directly and stop — no plan needed. Otherwise, run a second research pass based on the user's answers, then write the plan.

4. **Write the plan** — Save to `plans/YYYY-MM-DD-<slug>.md`. Show it to the user and iterate until they're satisfied.

## Plan structure

Use a Why / What / How structure. Order tasks by dependency, each completable in a focused session, with implementation and a holistic testing checklists. Reference specific files and modules from your research.

## Gotchas

- **Never ask a question you could answer by reading the code.** This is the #1 failure mode. Do your homework first.
- **Don't over-plan simple changes.** If it follows an existing pattern, just offer to build it.
- **Don't under-plan complex changes.** Take as many rounds of questions as needed.
- **Ground everything in code.** Reference specific files, patterns, and implementations. Generic questions are a sign you didn't research enough.
- **Present trade-offs, let the user decide.** Don't assume preferences.
- **Iterate the plan.** Actively ask for feedback after writing — don't just dump it.
- **Testing like an owner.** As a owner you need to ensure the plan covers testing it to make it really work, not just running unit tests and calling it  a day.
- **Wait for the green light.** Never start implementing until the user explicitly approves.
