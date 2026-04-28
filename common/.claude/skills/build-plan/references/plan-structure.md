# Plan Directory Structure

A plan is a directory, not a single file. The structure enables progressive disclosure — the builder agent loads only what it needs for the current task.

## Directory Layout

```
plans/YYYY-MM-DD-slug/
├── PLAN.md            # Entry point: problem, solution, decisions, milestones, task graph
└── tasks/             # One file per task (read individually)
    ├── 01-name.md
    ├── 02-name.md
    └── ...
```

## What Goes Where

### PLAN.md (the entry point)

Contains:

- **Problem**: What we're solving and why.
- **Solution**: How we're solving it.
- **Key decisions**: With brief rationale. Only decisions that affect multiple tasks.
- **Out of scope**: Explicit exclusions.
- **Milestones**: Each with a one-line demoable description, grouped tasks (linking to task files), and human checkpoints.

PLAN.md is what the builder reads first to understand scope. It should be self-sufficient for answering "what are we doing and why" without loading anything else.

### tasks/ (individual task specs)

One file per task, numbered for dependency order. Each task file contains:

- **Type**: AFK (builder runs unattended) or HITL (human in the loop).
- **Blocked by**: Task dependencies.
- **What**: What this task accomplishes.
- **Files**: Which files to modify, with line numbers from research.
- **Implementation**: Prose description of intent. Reference specific files and line numbers. Include signatures when they pin the public surface. Skip function bodies.
- **Verify**: Machine-executable checks — commands to run, outputs to expect, tests to pass.

A task file should give the builder everything it needs to implement that task without reading other task files.

## Builder Consumption Model

1. Read PLAN.md — understand scope, milestones, and task graph.
2. Pick next incomplete task — read its task file.
3. Implement the task.
4. Mark the task done (check it off in PLAN.md).
5. When all tasks in a milestone are done, run milestone-level verification.
6. Move to next milestone.
