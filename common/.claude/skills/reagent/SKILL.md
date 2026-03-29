---
name: reagent
description: Guide for using ReAgent to create code reviews and get results via CLI. Use when the user asks to review code changes, create a code review, get review feedback, or iterate on code based on review comments. Keywords - review, code review, reagent, diff, feedback.
---

# ReAgent Code Reviews

ReAgent provides a GitHub-style code review UI for local code changes. You create reviews via CLI, the user reviews in their browser, and you get structured feedback back.

## Workflow

1. **Create the review** with `--auto-start` (handles server lifecycle):
   ```
   reagent review --auto-start [--title "Review title"] [--description "What changed"]
   ```
   Parse the session ID from the output URL: `[Reagent] Review created: http://localhost:PORT/review/SESSION_ID`

2. **Tell the user** the review is ready and they should check their browser (it opens automatically).

3. **Wait for results** (blocks until user submits):
   ```
   reagent get SESSION_ID --wait --json
   ```

4. **Act on the result:**
   - `"approved"` → Acknowledge and move on.
   - `"changes_requested"` → Read each comment (file, line range, text) and the general feedback. If anything is ambiguous, ask the user for clarification before making changes. Apply the feedback, then offer to create a new review round.

See [references/cli.md](references/cli.md) for all CLI flags, review sources, and JSON output schema.

## Gotchas

- **Always use `--auto-start`** on `reagent review` — it checks if the server is running and starts it if needed
- **Always use `--wait --json`** on `reagent get` — without `--wait` you'll likely get `"pending"`; without `--json` output is human-readable text that's harder to parse
- **Parse session ID from the URL** — the UUID at the end of the review URL is the session ID you pass to `reagent get`
- **`--wait` timeout is 10 minutes** — polls every 1 second; if the user hasn't submitted by then, the command exits with an error. Re-run the same `reagent get` command to resume waiting.
- **Pending sessions auto-cancel after 30 minutes** — don't leave reviews sitting too long
- **Browser opens automatically** — do NOT pass `--no-open`
- **Comment `side` field** — `"new"` means the comment targets the current code, `"old"` targets the previous version
- **Iterating on feedback** — after applying requested changes, create a fresh `reagent review` for the new state of the code
