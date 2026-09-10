# /go

Align scope in an ordinary Pi conversation, then run `/go [steering]`.
The agent writes `PLAN.md` and `HANDOFF.md` in its own `.pi/go/runs/<runId>/` directory, launches a fresh session
in the same pane, and works until an independent reviewer passes the plan.

A dedicated line above the input stays visible with custom footers:

```text
▎ go ▶ running  2/5  Polish the terminal feedback                 esc pause
```

It shows the run phase, actual PLAN checklist progress and current task, plus
the next action. Paused/blocked runs show their reason; completed runs show
the plan title. It adapts to narrow terminals and clears in unrelated sessions.

- `/go pause` or **Esc** during work pauses; `/go resume` steers the owning session at the next tool boundary. Esc in an editor popup/dialog closes that UI without pausing the run.
- `/go status` shows state; `/go stop` ends the run as blocked.
- Runs are scoped to sessions. Other sessions in the same project can start their own `/go`. Automatic handoffs keep the same run directory.
- `/go reset` archives this session's run and clears its marker. Then `/go [steering]` starts fresh. Plans, journals, and handoffs stay on disk; reset waits for existing subagent work/results to finish.
- Type normally while working to steer the current task.
- `/go --tokens 2M` or `/go --minutes 90` sets an optional run budget.

To raise an exhausted budget, use `/go resume --tokens 4M` or
`/go resume --minutes 180`; these are total limits from run start. Token
limits are checked on completed responses; elapsed time has a timer.

State, plan, append-only journal, and handoff live in `.pi/go/runs/<runId>/`, locally
excluded from Git. Context resets load the plan, handoff, steering, and last
20 journal lines. A pending handoff waits for existing subagents and their results, then refreshes HANDOFF before switching. The TUI shows when it is waiting. The agent must keep handoffs at most 60 lines. Two resets
without journal growth pause the run. Two failed reviews block it.

Existing project-wide runs migrate when opened in their owning session; original files remain intact and never block another session.

Global settings: `~/.pi/agent/go.json`. Project overrides: `.pi/go/config.json`.

```json
{
  "resetThresholdTokens": 100000,
  "maxReviewRounds": 2,
  "maxStallResets": 2,
  "reviewer": {
    "provider": "anthropic",
    "thinkingLevel": "high"
  },
  "budget": null
}
```

Set `reviewer.model` to pin a model. Otherwise a different authenticated
Anthropic sibling is selected. If unavailable, the worker model is used
with a visible warning. The review session has only read/search tools.

Install from the dotfiles root with `stow --no-folding common -t "$HOME"`,
then `/reload` in Pi. No dependencies are added; the extension uses Pi's SDK.

Run all regression checks (~30 seconds on this host):

```sh
node common/.pi/agent/extensions/go/check.ts
```

This runs unit tests, same-project session/reset acceptance tests, the full
worker/reviewer lifecycle, actual subagent handoff, and native Pi TUI tests
through tmux. Each suite saves isolated evidence and fails the runner on error.
Pi and tmux must be on PATH; individual `*.uat.ts` files can also run directly.

Tests use the installed Pi SDK under `~/.local/lib/node_modules/`; set
`PI_PACKAGE_DIR` if installed elsewhere. UAT uses a deterministic provider
and isolated temporary repositories, with no paid model calls.

Provider failures use Pi's native retry policy. If retries fail, the pause
reason includes the provider error; `/go status` shows it in full.
Before `/reload`, let active subagents finish: Pi reload itself disposes
subagent sessions. Automatic `/go` handoffs wait for them.
