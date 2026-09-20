# Resume blocked runs — 2026-09-11

PASS: 48 unit tests + all five acceptance suites via `node common/.pi/agent/extensions/go/check.ts`.

Four new transition checks first failed against the old paused-only resume guard.
`/go resume` now accepts attached blocked runs, retaining run ID, owner, start time,
token usage, budgets, reset count and existing PLAN/HANDOFF/JOURNAL. The prompt
includes the prior blocker and asks the worker to use the user's latest clarification.
Plain clarification still does not automatically restart the loop. Reset/detached
runs remain non-resumable, and exhausted budgets still require an increased total.

Review-limit blockers return to the worker for repairs, with a fresh bounded review
allowance while cumulative review history remains intact. A regression confirms
the renewed allowance still blocks after its limit. The real SDK UAT covers both
worker `go_blocked` and two failed reviews, followed by clarification and same-run
resume to completion (review count 2 → 3). Native Pi TUI verifies the blocked
marker advertises `/go resume` and the command preserves the same run.

SDK evidence: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-uat-LGLodG`
(2 context resets, 10 extension instances).
TTY evidence: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-scoped-tui-UCXOhK`.
Strict runtime/UAT TypeScript and `git diff --check` passed.

---

# Tool policy and generic handoff reminder — 2026-09-10

PASS: 43 unit tests + five real-runtime acceptance suites via `node common/.pi/agent/extensions/go/check.ts`.

The generic reminder's guard previously suppressed only running/reviewing.
Tests reproduced warnings at >100k in planning, paused, blocked and completed
attached runs. The guard now respects session ownership until `/go reset`.

`tools.uat.ts` loads the real /go and handoff-reminder extensions in both orders
with an offline provider. It inspects tool schemas received by the model in
planning/running/reviewing, confirms core/web/background/subagent/custom tools
survive, and verifies restoration on pause/done/blocked/reset. Originally disabled
tools stay disabled through reload and fresh-session launch. The independent
reviewer retains only read/search tools. The actual 100001-token reminder is
suppressed for attached runs and delivered again after reset.

Latest focused evidence (19 provider requests per extension order):
`/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-tools-uat-b9s1hz`.
The full runner also passed session isolation, worker/reviewer lifecycle,
real-child handoff and native terminal acceptance suites.

---

# Session scoping regression — 2026-09-10

PASS: 35 unit tests plus four real-runtime acceptance suites on Pi 0.85.1 / Node 26.8.1.
Run everything from the dotfiles root:

```sh
node common/.pi/agent/extensions/go/check.ts
```

The runner fails on any failed assertion and requires `pi` and `tmux` on PATH.
No paid model calls: deterministic offline providers, temporary working directories,
real Pi sessions/tools/children, and native terminal input. Test notifications use a
local cmux shim. Terminal sessions are cleaned up in `finally`.

## Reproduction

Before the fix, the real SDK reproduced a paused legacy run owned by session A
blocking `/go` in session B while B's widget was hidden. The warning told B to
open A. Baseline evidence: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/go-orphan-repro-2ITsvZ/reproduction.json`.
`scoping.uat.ts` retains that exact trigger as a regression scenario.

## Coverage

| Suite | Acceptance checks |
|---|---|
| `*.test.ts` | State transitions, session pointers, equal start timestamps, corruption isolation, budgets, paths/config, legacy preservation, widget rendering, review contract, subagent gates |
| `scoping.uat.ts` | Two simultaneous same-project runs; isolated documents; owner-only migration; reset during streaming; archives; fresh start; reload; launch/context ownership transfers; old sessions cannot resurrect runs |
| `uat.ts` | Native abort/resume during tool loop; complete launch batch; two context resets; journal continuity; reviewer pass/fix/two failures; paused review; reset during review followed by fresh run without stale-result contamination |
| `subagents.uat.ts` | Real Pi child survives pending handoff, result delivered exactly once and incorporated before replacement, final review passes |
| `tui.uat.ts` | Actual Pi TUI: foreign paused legacy run; visible marker; Esc; `/reload`; 52-column display; `/go reset` clears marker and archives; fresh `/go`; legacy bytes untouched |

Full-run evidence:

- Sessions: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-scoping-uat-NlFxyn`
- Lifecycle: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-uat-SM2jco` (2 context resets, 9 extension instances)
- Subagents: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-subagents-uat-uwVqy7`
- Native terminal captures: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-scoped-tui-v1fpll`

Strict TypeScript passed for runtime and all acceptance harnesses. After final
prompt-path tightening, core tests and session-scoping UAT were rerun. Temporary
artifacts may be removed by the OS; all acceptance harnesses are checked in.

The reported Kaiten session `01a08a26-c41b-7252-bb0b-bd256b6576a5` was also checked
with the new lookup: no run belongs to it, so it can start `/go`; legacy state
remained byte-for-byte unchanged. Reload Pi to activate the installed code.

---

# Acceptance evidence — 2026-09-09

PASS on Pi 0.85.1, Node 26.8.1, macOS. Installed through Stow.
No paid model calls: UAT runs real Pi sessions and tools with a deterministic provider.

| Requirement | Evidence |
|---|---|
| Commands, planning, launch, pause/resume/stop, ownership, active tools | `index.test.ts`; real SDK and terminal flows |
| Config merge/validation, steering, token/minute budgets | `core.test.ts`, `index.test.ts`; live timer abort and raised-budget resume |
| PLAN/HANDOFF validation, 60-line limit, seeds, stall counter | `core.test.ts` |
| Fresh sessions in same runtime/pane, two context resets, parent linkage | `uat.ts`: 2 resets, 7 distinct extension instances across scenarios |
| Complete tool batch before replacement; no stale context | UAT trailing write after `go_launch` completes; replacement session owns tools |
| Journal continuity and handoff reload | Actual write/bash tools; markers 1 and 2 reloaded and journal entries retained |
| Independent read-only reviewer, pass/fail parsing, fallback warning | `reviewer.test.ts`; SDK UAT asserts different model and exact read/search tools |
| Failed review → fixes → pass; two failed reviews → blocked | Real SDK UAT, including new proof artifact and journal evidence |
| Reviewer cancellation/resume and stale attempt protection | Held reviewer aborted; interrupted attempt consumes no round; resumed review passes |
| Native Esc during work and review | Interactive Pi driven by tmux; state and actual aborted reviewer trace inspected |
| Token null/threshold boundary and cancelled tool batches | `index.test.ts`; strict `>` threshold and signal-aborted toolUse |
| Terminal notifications, status, tool removal | SDK/TTY runs; cmux notifications invoked for terminal states |
| Reminder coexistence and foreign sessions | `reminder.test.ts`: only matching running/reviewing session suppresses reminder |
| Git exclusion and installation | UAT inspects `.git/info/exclude`; Stow link to `go/index.ts` verified |

Commands passed:

```sh
node --test common/.pi/agent/extensions/go/*.test.ts  # 25 passed
node common/.pi/agent/extensions/go/uat.ts            # 13 SDK scenarios/check groups passed
```

Strict TypeScript `--noEmit` passed for core, extension, reviewer, and handoff
reminder against installed Pi SDK declarations (temporary config
`/tmp/go-all-tsconfig.json`; existing TypeScript binary, no added dependency).
`git diff --check` passed. Global compaction is already disabled.

SDK artifacts: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-uat-XASH1h`.
Terminal captures/state/trace: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-tty-f8gsjn6b`.
Temporary artifact paths may be cleaned by the OS. The checked-in harness is reproducible.

User smoke test (~2 min to start): `/reload`, align a tiny task, then `/go`.
Use Esc and `/go resume` to exercise pause. Optional `.pi/go/config.json`
with `resetThresholdTokens: 20000` makes resets easier to observe on a longer task.


## Dedicated indicator follow-up

PASS with the actual `statusline.ts` custom footer and `tokyonight.json`
theme, in interactive Pi at 120 and 52 columns. Verified running task/fraction,
paused reason/resume hint, reviewing, done title, and native Esc/resume during
both work and review. The widget is above the editor and survives session replacement.

Six renderer tests cover every phase, honest checklist counting (excluding
fenced examples), control/ANSI sanitization, emoji/CJK and widths 0–140.
Integration test covers task writes, widget placement, pause, unrelated
session hiding and shutdown cleanup. All 25 tests, strict TypeScript, and the
13 SDK UAT check groups pass.

Latest SDK evidence: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-uat-RCKKli`.
Native color captures: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-indicator-utra2t2i`.

## Resume / subagent handoff / unexpected pause fixes — 2026-09-10

PASS: 29 /go tests + 24 subagents tests; strict TypeScript for both extensions.

- Real SDK regression reproduces resume starvation behind five native tool turns;
  the fix delivers resume as steering at the next boundary, with no orphaned follow-up.
- Real Pi child backend stays alive while context reset is pending. Its result is
  ingested exactly once and included in HANDOFF and JOURNAL before replacement.
  The child is never cancelled; the replacement session passes review.
- Gates cover active/spawning/restarting children, deferred/queued reports,
  late results invalidating a prepared handoff, and completion waking an idle parent.
- Explicit subagent_wait clears delivery bookkeeping even when native Esc discarded
  the queued automatic report; saved manager results remain available.
- Native terminal UAT with the custom footer/theme confirms Esc dismisses dialogs
  without pausing either worker or reviewer; bare Esc still pauses actual work,
  and resume completes. Exhausted provider failures now retain the actual error.

Reproduce:

```sh
node --test common/.pi/agent/extensions/go/*.test.ts
node common/.pi/agent/extensions/go/uat.ts
node common/.pi/agent/extensions/go/subagents.uat.ts
(cd common/.pi/agent/extensions/subagents && npm test && npm run check)
```

Latest SDK artifacts: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-uat-ttX5Gs`.
Subagent artifacts: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-subagents-uat-7y1yuu`.
TTY evidence: `/var/folders/xx/nlvm2q6968l0vhhzcmqpltg80000gp/T/pi-go-fixes-tty-ie66_6qg`.

Let existing subagents finish before `/reload`; manual Pi reload disposes their
runtime. Automatic /go handoffs now wait instead.
