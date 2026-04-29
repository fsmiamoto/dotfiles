---
description: Launch a ralfinho run from a plan file in a new tmux window, with flag suggestions based on the plan
argument-hint: <plan-file-path> [extra ralfinho flags]
---
# Ralfinho

You are launching a ralfinho run to autonomously execute a plan.

<user_input>
$ARGUMENTS
</user_input>

## Step 1 — Get the plan file path

If `$ARGUMENTS` contains a path to a `.md` file, use that as the plan path. Otherwise, ask the user for the plan file path.

Confirm the file exists on disk before proceeding.

## Step 2 — Suggest flags

Using your knowledge of the plan from the current conversation context (you likely just wrote it), reason about which ralfinho flags to suggest beyond the defaults.

Consider:
- **`--inactivity-timeout`**: if the plan has tasks that are expected to take a long time (large refactors, full test suites, builds), suggest `--inactivity-timeout 0` or a longer duration.
- **`--max-iterations`**: if the plan has a known number of tasks, suggest a max slightly above that count as a safety net.
- **`-a <agent>`**: if the user passed an agent override in `$ARGUMENTS`, use it. Otherwise leave it as the ralfinho default.
- Forward any extra flags from `$ARGUMENTS` as-is.

## Step 3 — Confirm with the user

Present the full command that will be run, e.g.:

```
ralfinho --plan plans/refactor-auth.md --inactivity-timeout 0 -m 12
```

With a one-line rationale for each non-default flag. Wait for user confirmation before proceeding. Incorporate any feedback.

## Step 4 — Launch in a new tmux window

Once confirmed:

1. Write a launcher script to `/tmp/ralfinho-launch-TIMESTAMP.sh`:

```sh
#!/bin/sh
cd "WORKING_DIR"
ralfinho [confirmed flags]
echo "--- ralfinho exited with code $? ---"
exec $SHELL
```

Replace `WORKING_DIR` with the current working directory, `TIMESTAMP` with the Unix timestamp, and `[confirmed flags]` with the confirmed command flags.

2. Make the script executable: `chmod +x /tmp/ralfinho-launch-TIMESTAMP.sh`

3. Open a new tmux window running the script:

```sh
tmux new-window -n "ralfinho" /tmp/ralfinho-launch-TIMESTAMP.sh
```

## Step 5 — Report back

Tell the user:
- The tmux window name where ralfinho is running
- That they can ask you to check on progress anytime

## Checking on progress (when the user asks later)

When the user asks you to check on the ralfinho run:

1. **Primary**: read files in `.ralfinho/runs/` in the project directory — look for the most recent run and inspect its artifacts (iteration logs, status).
2. **Fallback**: if run artifacts are insufficient, use `tmux capture-pane -t <window> -p` to grab the TUI output.

Report a concise summary: which task is being worked on, how many are done, any issues.

## Gotchas

- **Do not read the plan file from disk** — you already have the plan content in your conversation context.
- **Do not modify any project files.**
- **Do not poll automatically.** Launch, report, and stop. The user will ask you to check when they want.
- **Do not close or switch away from the current tmux window.**
