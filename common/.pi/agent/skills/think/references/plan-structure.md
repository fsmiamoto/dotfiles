# Plan Directory Structure

A plan is a directory, not a single file. The structure enables progressive disclosure — the builder agent loads only what it needs for the current task.

## Directory Layout

```
plans/YYYY-MM-DD-slug/
├── PLAN.md            # Entry point: goal, decisions, task graph
├── context/           # Research findings (loaded on demand)
│   ├── architecture.md
│   ├── patterns.md
│   └── risks.md
├── tasks/             # One file per task (read individually)
│   ├── 01-name.md
│   ├── 02-name.md
│   └── ...
└── snippets/          # Code examples referenced by tasks
    └── example-name.md
```

## What Goes Where

### PLAN.md (the entry point)

~30-50 lines. Contains:

- **Goal**: 1-2 sentences — what and why.
- **Key decisions**: Inline, with brief rationale. Only decisions that affect multiple tasks.
- **Task list**: Dependency-ordered, each linking to its task file. One-line summary + files touched.
- **Testing checklist**: High-level verification across the whole plan.

PLAN.md is what the builder reads first to understand scope. It should be self-sufficient for answering "what are we doing and why" without loading anything else.

### context/ (research findings)

Split research output by topic. Common files:

- `architecture.md` — How the relevant parts of the system are structured today.
- `patterns.md` — Existing patterns the implementation should follow.
- `risks.md` — What could go wrong, edge cases, mitigations.

Tasks link to specific context files. A task touching the auth layer links to `context/architecture.md`; a task about the UI doesn't.

**Only create context files that are actually referenced by tasks.** Don't create empty files for completeness.

### tasks/ (individual task specs)

One file per task, numbered for dependency order. Each task file contains:

- What this task accomplishes.
- Which files to modify (with line numbers from research).
- Implementation approach with specific details.
- Links to relevant context/ and snippets/ files.
- Verification steps for this task alone.

A task file should give the builder everything it needs to implement that task without reading other task files.

### snippets/ (code examples)

For anything easier to show than describe:

- Current code that needs to change.
- Patterns from elsewhere in the codebase to follow.
- Expected transformations (before/after).

Keep snippets focused. One concept per file.

## Complexity Gating

Not every plan needs the full structure:

| Complexity | Structure |
|---|---|
| Simple | Skip the plan — offer to build directly |
| Moderate | PLAN.md + tasks/ only |
| Complex | Full directory: PLAN.md + context/ + tasks/ + snippets/ |

## Builder Consumption Model

When a builder agent picks up the plan:

1. Read PLAN.md — understand scope and task graph.
2. Pick next incomplete task — read its task file.
3. Load linked context/ or snippets/ files only if the task references them.
4. Implement the task.
5. Mark the task done (check it off in PLAN.md).
6. Move to next task.

This keeps the context window lean and each task self-contained.
