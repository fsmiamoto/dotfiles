# `/go` — autonomous run with context resets

Status: implemented; SDK and native terminal UAT verified on Pi 0.85.1 (2026-09-09). See `UAT.md`. Standalone Pi extension in `common/.pi/agent/extensions/go/`.

## 1. UX

1. Chat with the agent until scope is aligned.
2. `/go [steering]` — e.g. `/go`, `/go throwaway POC, use your judgment on design choices`.
3. Agent writes `.pi/go/runs/<runId>/PLAN.md` + `HANDOFF.md` from the conversation, calls `go_launch()`.
4. Extension starts a **fresh session in the same pane** seeded with PLAN + HANDOFF. Runs unattended.
5. Agent works task by task, appends `JOURNAL.md`, keeps `HANDOFF.md` current.
6. Context > 100k → extension forces a handoff + fresh session. Repeats as needed.
7. Agent calls `go_done()` → independent reviewer (different model) → pass ⇒ finished; fail ⇒ findings sent back, agent fixes, `go_done()` again (max 2 rounds).
8. Any terminal state ⇒ `cmux notify`.

A dedicated, theme-colored row above the input shows phase, PLAN checklist progress/current task, and contextual action. It remains visible with custom footers and across resets/pauses; narrow widths prioritize state and action.

While running: typed text = native steer. `Esc` = pause. `/go pause|resume|status|stop|reset`.

## 2. Files — `.pi/go/runs/<runId>/` in the project (added to `.git/info/exclude`)

| File | Owner | Purpose |
|---|---|---|
| `PLAN.md` | agent | Scope, non-goals, **done-criteria** (verifiable), task checklist. Updated as tasks complete / plan changes. |
| `JOURNAL.md` | agent (append-only) | One entry per task/decision/test run: timestamp, what, why, evidence. Never rewritten. |
| `HANDOFF.md` | agent | ≤ 60 lines. Current task, state of the tree, what's verified, next 1–3 actions, gotchas. **Only thing reloaded on reset** besides PLAN. |
| `state.json` | extension | `{status, steering, sessionFile, startedAt, resets, journalLinesAtLastReset, reviewRounds, budget?}` |

`status ∈ planning | running | reviewing | paused | blocked | done`.

Each session selects only its own run. Handoffs transfer ownership to the replacement session while keeping the same run ID and files. Independent sessions can run concurrently. `/go reset` archives only the current run (`detached: true`), clears its marker/tools, and preserves its files; existing subagents/results must finish first. A subsequent `/go` starts in a fresh run directory. Project config stays at `.pi/go/config.json`. Legacy root files migrate only for their owning session and remain intact.

## 3. Extension API surface

**Commands**
- `/go [steering]` — if no state or status ∈ done/blocked: start planning. Verbs: `pause`, `resume`, `status`, `stop`, `reset`. State lookup is scoped to the current session.
- `/go-reset` (internal) — invoked at `agent_settled` via `pi.sendUserMessage("/go-reset", {expandPromptTemplates:true})` because `ctx.newSession()` exists only on `ExtensionCommandContext` (command handlers), not on event/tool contexts. Same pattern as `examples/extensions/reload-runtime.ts`.

**Tools** (registered dynamically for the owning active run, deactivated on terminal states; `promptGuidelines` name the tool explicitly)
- `go_launch()` — validates PLAN.md + HANDOFF.md exist, sets `running` and persists a pending launch; `agent_settled` dispatches `/go-reset` after the complete tool batch.
- `go_done()` — sets `reviewing`, triggers reviewer.
- `go_blocked(reason)` — sets `blocked`, notifies, stops loop. After clarifying, `/go resume` continues the same run; planning resumes planning, other blocked phases resume worker execution. Review retry allowance restarts from the current cumulative round count; budgets and prior evidence remain intact.

**Events**
- `session_start` — read `state.json`; if `sessionFile` matches current session and status is `running`, the loop is armed. Other Pi sessions in the same cwd are ignored (no hijack).
- `turn_end` — if armed and `ctx.getContextUsage().tokens > threshold` and no reset pending: send steer *"Context limit reached. Update HANDOFF.md and append JOURNAL.md now, then stop without starting new work."* and mark reset pending.
- `agent_settled` — if armed:
  - last assistant `stopReason === "aborted"` (Esc) ⇒ `paused`, notify, stop.
  - reset pending ⇒ wait for active subagents and queued results; request updated HANDOFF after results are incorporated; then stall check and `sendUserMessage("/go-reset")`. Re-check readiness immediately before replacement.
  - status `running` ⇒ `sendUserMessage(CONTINUE_PROMPT)`.
  - status `reviewing` ⇒ run reviewer (see §5).

**Reset (`/go-reset` handler)**
```ts
const cwd = ctx.cwd; // capture plain data before old ctx becomes stale
await ctx.newSession({
  parentSession: state.sessionFile,
  setup: async (sessionManager) => {
    state.sessionFile = sessionManager.getSessionFile();
    saveState(cwd, state); // setup precedes replacement session_start
  },
  withSession: async (ctx2) => {
    await ctx2.sendUserMessage(seedPrompt(PLAN, HANDOFF, steering, journalTail(20)));
  },
});
```
Footguns (docs §"Session replacement lifecycle"): extension is re-instantiated for the new session; keep **no run decisions** in memory — everything in `state.json`; only disposable timer/input-listener handles are session-local. Only use `ctx2` inside `withSession`.

## 4. Prompts (sketch)

- **PLAN prompt** (from `/go`): "From this conversation write `.pi/go/runs/<runId>/PLAN.md` (scope, non-goals, done-criteria each verifiable by command or inspection, ordered tasks) and `HANDOFF.md` (starting state). Steering: `<args>`. Then call `go_launch`."
- **Seed prompt** (each fresh session): identity of the run, steering, autonomy rules, PLAN, HANDOFF, last 20 journal lines, "continue with the current task".
- **CONTINUE prompt**: "Continue the /go run. Check PLAN.md; when all done-criteria hold, call go_done. Journal before moving on."
- **Autonomy rules**: bounded by default — decide routine implementation details yourself; pause (`go_blocked`) on scope change, destructive/irreversible actions, external side effects not in PLAN, or genuine blockers. Steering text may loosen design freedom, never safety/scope.
- **Journal rule**: every completed task, decision, failed approach, and test run ⇒ one JOURNAL entry, before starting the next thing.

## 5. Reviewer

- Pi in-process session via SDK `ModelRuntime`, with selection via `ctx.modelRegistry` with **a different Anthropic model** (`config.reviewer.model`, default: sibling tier of the worker, e.g. worker fable → reviewer opus).
- Input: PLAN.md, JOURNAL.md, HANDOFF.md, `git status --short`, `git diff` (bounded), read-only tools.
- Output contract: one marker `<pass/>` or `<fail/>` + findings list.
- fail ⇒ findings appended to JOURNAL (`## Review round N`) and sent as user message; status back to `running`. After `maxReviewRounds` (2) fails ⇒ `blocked`.
- pass ⇒ `done`, final JOURNAL entry, notify.

## 6. Guards & config

```json
// ~/.pi/agent/go.json (global) or .pi/go/config.json (project overrides)
{ "resetThresholdTokens": 100000, "maxReviewRounds": 2, "maxStallResets": 2,
  "reviewer": { "provider": "anthropic", "model": "<id>", "thinkingLevel": "high" },
  "budget": null }
```
- **Stall**: reset with `wc -l JOURNAL.md` unchanged since last reset ⇒ stall++; ≥ `maxStallResets` ⇒ `paused`, notify.
- **Budget**: none by default. Optional per run `/go --tokens 2M` or `--minutes 90` ⇒ pause at limit. Token accounting uses completed worker/reviewer usage; a timer enforces elapsed wall time. `/go resume --tokens 4M` or `--minutes 180` raises the total limit. A review that passes over budget is retained for resume.
- **Threshold** = current context size (`getContextUsage`), not cumulative spend.
- Reset only between turns (`agent_settled`), never mid tool batch or while a subagent/result is pending.
- Resume uses steering so it reaches the next tool boundary instead of starving in the follow-up queue.
- Native worker aborts pause the run. Esc dismissing dialogs/editor UI does not. Independent review retains an idle Esc handler scoped away from dialogs/overlays/editor text.
- Provider failures retain Pi native retries; exhausted failures pause with the concrete error.

## 7. Interactions with existing setup

- `handoff-reminder.ts` also fires at 100k → must no-op while any scoped run is attached to the current session, including planning, paused, blocked, and done. `/go reset` releases ownership.
- Global `compaction.enabled=false` already — good; /go never relies on built-in compaction.
- `/go` hides redundant context/recall tools while active; running/reviewing also hide interactive feedback/question/review tools. Other originally enabled tools remain. Phase-specific goal controls and the pre-run tool selection persist through handoffs/reload; pause/terminal/reset restore the normal selection.

## 8. Non-goals

No dashboard. One dedicated above-editor status row; no additional panels or animation. One current run per session; no multi-goal dashboard. No cross-project registry. No subagent orchestration inside /go itself; existing subagents may be used and must finish/deliver results before handoff or review.

## 9. Verify during implementation

1. Extension re-instantiation on `newSession` — confirm module-level state is lost; confirm `session_start` fires in new instance with `state.json` readable.
2. Abort detection field on last assistant message after Esc.
3. `sendUserMessage("/go-reset")` reaches the command handler from `agent_settled` (idle) — no `deliverAs` needed when idle, but `expandPromptTemplates:true` is required. Expanded commands dispatch immediately, even with `deliverAs:"followUp"`; launch therefore waits for `agent_settled`.
4. Reviewer model availability via `ctx.modelRegistry.find(provider, id)`; fallback = worker model + warning, never silent.
5. `getContextUsage().tokens` is 0 in a fresh SDK session and can be `null` after compaction — treat both as 0.

## 10. Test plan

- Unit (`node:test`): state machine transitions, stall counter, threshold check, prompt builders, config merge.
- Manual: tiny repo, PLAN with 3 trivial tasks, `resetThresholdTokens` set low (e.g. 20k) to force 2+ resets; verify JOURNAL continuity, HANDOFF reload, reviewer pass, Esc ⇒ pause, `/go resume`.

## 11. Install

Stow-managed: new dir `common/.pi/agent/extensions/go/` → `make install` (or `stow common`) links it into `~/.pi/agent/extensions/go/`. Then `/reload`.
