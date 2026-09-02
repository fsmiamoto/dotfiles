---
description: Hand off the current Pi session to a new herdr (or tmux) pane with a concise context summary
argument-hint: "[optional steering context for the next session]"
---
# Handoff

Prepare a handoff from the current session to a fresh Pi session.

<steering_context>
$ARGUMENTS
</steering_context>

## Step 1 — Build the handoff summary

Analyze the full conversation above. Also run read-only git commands (`git status --short`, `git diff --stat`, and targeted `git diff` as needed) to see what changed on disk.

Write a handoff summary with exactly these 5 sections for an engineer picking up this work. Keep it short and focus on non-obvious context:

1. **What we were working on** — the goal/task in plain language
2. **What was done** — key changes made, decisions taken
3. **What's still open** — unfinished work, next steps
4. **Key files touched** — so the new session knows where to look
5. **Decisions & context** — non-obvious choices that would be lost

If `$ARGUMENTS` is non-empty, use it as steering context while writing the summary (e.g. emphasize certain next steps or omit irrelevant threads).

## Step 2 — Confirm or proceed

Present the draft summary to the user and ask for confirmation before spawning the new session. Incorporate any feedback, then proceed once you have the green light.

## Step 3 — Spawn the new session

Once the summary is final:

1. Get the current working directory with `pwd` and a Unix timestamp with `date +%s`.
2. Write the handoff summary to `/tmp/pi-handoff-TIMESTAMP.md`, prefixed with:

   ```text
   You are picking up where a previous session left off. Here is the context:
   ```

3. Spawn the new session next to this one.

   **If running inside herdr** (`HERDR_ENV=1`):

   ```sh
   herdr pane split --current --direction right --cwd "WORKING_DIR" --focus
   ```

   Read the new pane ID from `.result.pane.pane_id`, then start Pi there with the summary as the initial prompt:

   ```sh
   herdr agent start handoff-TIMESTAMP --kind pi --pane NEW_PANE_ID -- @/tmp/pi-handoff-TIMESTAMP.md
   ```

   If the current pane is narrow or tall (check `herdr pane layout --current` when unsure), split `down` instead of `right`.

   **Else, if running inside tmux** (`$TMUX` set): write a launcher script to `/tmp/pi-handoff-launch-TIMESTAMP.sh`:

   ```sh
   #!/bin/sh
   cd "WORKING_DIR" || exit 1
   exec pi @/tmp/pi-handoff-TIMESTAMP.md
   ```

   `chmod +x` it, then open a vertical split running it:

   ```sh
   tmux split-window -h /tmp/pi-handoff-launch-TIMESTAMP.sh
   ```

   **Otherwise**: do not fail noisily; write the launcher script anyway and tell the user its path so they can run it manually.

4. Confirm to the user that the new pane/session has been spawned. The current session stays open.

## Gotchas

- **Keep the summary short.** Assume you're handing it off to a competent engineer.
- **Do not ask questions you can answer yourself.** Read the conversation and git output first.
- **Do not modify project files.** Only write the temporary handoff files in `/tmp`.
- **Do not close or disturb the current pane.**
