## Skills and configuration
The user has a dotfiles repo at ~/.dotfiles that controls most of the system configuration.

Agent skills are managed through the mansk CLI and have a manifest in the dotfiles.

## Git commits
Before committing, check `git log` and match the repo's existing commit message conventions (e.g. conventional commits like `feat:`/`fix:`).

Never push a commit without explicit permission from the user.

## Obsidian vault
The user has an Obsidian vault at `~/Documents/Vault` with personal notes, work notes (e.g. `sakanaai/` for current job), reports, and reference material.

Search it (grep/find) when relevant context might exist there; save reports/analyses there when the user asks to persist something for later reference.

## Communication guidelines
Be extremely concise. Sacrifice grammar for the sake of concision.

Humans have limited mental bandwidth so remember that when communicating.

Use principles like the Pyramid one to create the highest bandwidth communication
channel you can.

## Hunk reviews

When the user asks to look at, read, or address their Hunk comments, run:

```bash
hunk session comment list --repo . --type user --json
```

Treat the returned user comments as review feedback for the current task.

## servant

Whenever you want to surface some static HTML/artifact for alignment with the user, prefer using the `servant` CLI.

Static HTML created only for explanation or alignment does not need Playwright or automated browser QA.

## Markdown previews

To preview Markdown locally with GitHub-like rendering, use:

```bash
uvx grip README.md
```

Open the localhost URL it prints.

## Subagents
Use subagents to scale your impact and preserve your context window.

For research tasks where you answer can be sumarrized in a paragraph, let it be done by a peer agent.

For coding tasks where you have a detailed spec as well, use them and use your intelligence to ensure
it delivered the right thing.

After spawning a subagent, wait for its automatic report. Do not peek, poll, or run sleep commands to wait for it. Only inspect a subagent if it has run unusually long and there is concrete reason to suspect it is stuck; steer it only when redirection is necessary.

### Subagent model selection

- Selection precedence is: explicit override > provider-qualified profile model > exact parent provider/model.
- For normal delegation, omit `model` so `agent_spawn` inherits the exact parent provider/model.
- Deliberate overrides must use `provider/model`; bare model IDs are rejected.

## cmux

Most of the time, the user will be using this host from a remote machine so they'll use cmux for better ergonomics.

You have a `cmux` CLI on PATH to interact with it (app bundle locally, `~/.cmux/bin` on remote hosts — always invoke it as bare `cmux`).

### Notifications
- Use `cmux notify` when you need the user's attention.
- `cmux notify` takes flags; do **not** pass a JSON payload.
- Good cases: waiting on user input, notable failures, or important task completion.
- Use notifications sparingly and avoid spam.
- Use title = tool/agent name and body = actionable message; include project/host/cwd context in the body if useful.
- Examples:
  - `cmux notify --title "Pi" --body "[$(basename "$PWD")] Need your input on this change"`
  - `cmux notify --title "Pi" --body "[$(basename "$PWD")] Tests finished successfully"`

### Browser
- Use cmux browser panes to show useful URLs, localhost dev servers, and browser-viewable artifacts.
- Use cmux browser as a user-visible surface, not as the primary automated QA tool; keep Playwright/headless tooling for repeatable browser tests.
- Open pages when useful, including external URLs when they help the task.
- For a different/new thing, open a new split: `cmux browser open-split http://localhost:5173`.
- When iterating on the same page and you know the browser surface, reuse it: `cmux browser surface:2 navigate http://localhost:5173`.
- Use judgment before opening sensitive pages; ask first for admin consoles, credentials, production dashboards, or personal data.
- Gotcha: file:// doesn't work

### Local files and directories
- To show local HTML/static artifacts, serve them over a temporary localhost HTTP server and open that URL with `cmux browser`.
- Pick an available/free port; use named background processes for temporary servers and stop them when the review/task is done.
- Viewing through the cmux browser plus reporting the remote path is enough; do not copy artifacts to the user's Mac unless explicitly asked.
- Automatically open dev servers/artifacts only when useful for visual review, QA, or a final deliverable; otherwise report the URL/path.
