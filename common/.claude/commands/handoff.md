---
description: Hand off the current session to a new one in a herdr (or tmux) pane with a context summary
argument-hint: [optional steering context for the next session]
---
# Handoff

You are preparing a handoff from the current session to a fresh Claude Code session.

<steering_context>
$ARGUMENTS
</steering_context>

## Step 1 — Build the handoff summary

Analyze the full conversation above. Also run `git diff` and `git status` to see what changed on disk.

Write a handoff summary with exactly these 5 sections for an engineer picking up this. 
Kept it short and focus on the main points the non-obvious points you would like to get across.

1. **What we were working on** — the goal/task in plain language
2. **What was done** — key changes made, decisions taken
3. **What's still open** — unfinished work, next steps
4. **Key files touched** — so the new session knows where to look
5. **Decisions & context** — non-obvious choices that would be lost

If `$ARGUMENTS` is non-empty, use it as steering context while writing the summary (e.g., emphasize certain next steps, omit irrelevant threads).

## Step 2 — Confirm or proceed

Present the draft summary to the user and ask for confirmation before spawning the new session. Incorporate any feedback, then proceed once you have
the green light.

## Step 3 — Spawn the new session

Once the summary is final:

1. Write the handoff summary to `/tmp/handoff-TIMESTAMP.md` (use the actual Unix timestamp), prefixed with: "You are picking up where a previous session left off. Here is the context:"

2. Spawn the new session next to this one.

**If running inside herdr** (`HERDR_ENV=1`):

```sh
herdr pane split --current --direction right --cwd "WORKING_DIR" --focus
```

Read the new pane ID from `.result.pane.pane_id`, then start Claude there with the summary as the initial prompt:

```sh
herdr agent start handoff-TIMESTAMP --kind claude --pane NEW_PANE_ID -- --dangerously-skip-permissions "$(cat /tmp/handoff-TIMESTAMP.md)"
```

If the current pane is narrow or tall (check `herdr pane layout --current` when unsure), split `down` instead of `right`.

**Else, if running inside tmux** (`$TMUX` set): write a launcher script to `/tmp/handoff-launch-TIMESTAMP.sh`:

```sh
#!/bin/sh
cd "WORKING_DIR"
exec claude --dangerously-skip-permissions "$(cat /tmp/handoff-TIMESTAMP.md)"
```

`chmod +x` it, then open a vertical split running it:

```sh
tmux split-window -h /tmp/handoff-launch-TIMESTAMP.sh
```

**Otherwise**: write the launcher script anyway and tell the user its path so they can run it manually.

3. Confirm to the user that the new pane has been spawned. The current session stays open.

## Gotchas

- **Keep the summary short.** Assume you're handing it off to a competent engineer, no need to mention all the low level stuff.
- **Do not ask questions you can answer yourself.** Read the conversation and git output first.
- **Do not modify any project files**
- **Do not close or disturb the current pane.**
