---
description: Hand off the current session to a new one in a tmux pane with a context summary
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

2. Write a launcher script to `/tmp/handoff-launch-TIMESTAMP.sh`:

```sh
#!/bin/sh
cd "WORKING_DIR"
exec claude --dangerously-skip-permissions "$(cat /tmp/handoff-TIMESTAMP.md)"
```

Replace `WORKING_DIR` with the current working directory and `TIMESTAMP` with the matching timestamp.

3. Make the script executable: `chmod +x /tmp/handoff-launch-TIMESTAMP.sh`

4. Open a vertical tmux split running the script:

```sh
tmux split-window -h /tmp/handoff-launch-TIMESTAMP.sh
```

5. Confirm to the user that the new pane has been spawned. The current session stays open.

## Gotchas

- **Keep the summary short.** Assume you're handing it off to a competent engineer, no need to mention all the low level stuff.
- **Do not ask questions you can answer yourself.** Read the conversation and git output first.
- **Do not modify any project files**
- **Do not close or disturb the current tmux pane.**
