# /workflow — dynamic, task-specific state machines

Unlike `/goal` (a fixed Planner→Builder→Verifier→Review→Gate pipeline), `/workflow`
generates a **state machine tailored to each task**: a planner sub-agent designs a
graph of nodes for the objective, you approve it from an HTML visualization, and a
generic engine executes it. Graphs are saved as JSON and reusable.

## UX

```
/workflow <objective>          plan a graph for this task (read-only repo inspection)
/workflow open                 open the HTML visualization again
/workflow approve              execute the pending graph
/workflow revise <feedback>    re-plan with feedback applied to the previous graph
/workflow reject               discard the pending graph (files are kept)

/workflow run <id-fragment>    execute any saved workflow (reuse!)
/workflow resume               continue an interrupted run from persisted state
/workflow list                 list saved workflows

/workflow status | pause | retry | skip | quit     control an active run
<plain text>                   steers the running node / answers a manual node
```

## The workflow language

Saved at `~/.pi/agent/workflows/<timestamp>-<id>.workflow.json` (+ `.html` viz):

```jsonc
{
  "version": 1,
  "id": "kebab-slug",
  "title": "Human title",
  "objective": "what the user asked for",
  "start": "first-node-id",
  "nodes": [
    {
      "id": "verify",
      "title": "Verify",
      "kind": "agent",            // agent | command | manual | terminal
      "prompt": "what to do (self-contained)",
      "command": "true",          // only for kind=command
      "successCriteria": ["observable check"],
      "transitions": [            // edge labels = the node's possible outcomes
        { "on": "pass", "to": "finish" },
        { "on": "needs-repair", "to": "repair" }
      ]
    }
  ]
}
```

Node kinds:

- **agent** — fresh sub-agent session; reports via an `outcome` tool whose enum is
  exactly the node's transition labels. No tool call → single edge is implicit,
  multi-edge falls back to a classifier pass.
- **command** — deterministic shell exec, no LLM. exit 0 → `done`, else `failed`
  (aliases `fail`/`error` match too). Unmatched outcome → pause for the user.
- **manual** — pauses and asks the user; the typed answer picks the edge.
- **terminal** — final agent pass that presents results; must have no transitions.

Engine safety: max 30 steps per run, max 3 visits per node — exceeding either pauses
the run (`retry` overrides, `skip` follows the first edge, `quit` stops).

## State & logs

- `~/.pi/agent/workflows/state.json` — pending approval + active run; survives
  restarts (`/workflow resume`). Cleared on clean completion.
- `~/.pi/agent/workflow-logs/wf-*.jsonl` — append-only event log per run
  (node timings, outcomes, edges) — used for benchmarking.
- Planner role/prompt: `~/.pi/agent/workflow/planner.md` (frontmatter: `tools`, `model`).
