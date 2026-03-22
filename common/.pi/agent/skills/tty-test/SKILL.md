---
description: |
  Test CLIs and TUIs that require a real TTY by driving them through tmux sessions.
  Use when: testing interactive terminal programs, TUI apps, ncurses interfaces,
  programs that need a PTY, CLI tools with prompts/spinners/progress bars,
  or any command that behaves differently without a terminal.
  Keywords: tty, pty, tui, interactive, terminal, ncurses, curses, prompt, readline, expect.
---

# TTY Test

Drive interactive CLI/TUI programs via tmux. The Bash tool has no TTY — use this skill whenever the program under test needs one.

## Workflow

1. **Start** a tmux session with the target program
2. **Interact** by sending keys
3. **Capture** the screen to read output
4. **Assert** on captured content
5. **Cleanup** the session

Run the helper at `scripts/tty-test.sh` (relative to this skill's directory):

```bash
tty-test.sh start  <name> '<command>' [--cols 80] [--rows 24]
tty-test.sh send   <name> '<keys>'
tty-test.sh capture <name> [--history]
tty-test.sh wait   <name> '<pattern>' [--timeout 10]
tty-test.sh kill   <name>
tty-test.sh list
```

Typical pattern — always pair `send` with `wait`:

```bash
tty-test.sh start myapp './my-tui'
tty-test.sh wait myapp 'Select an option'     # wait for prompt
tty-test.sh send myapp Down Down Enter         # navigate menu
tty-test.sh wait myapp 'You selected'          # wait for response
tty-test.sh capture myapp                      # grab full screen if needed
tty-test.sh kill myapp
```

## Gotchas

- **Timing is everything.** Always `wait` for expected output before sending the next keypress. Never assume the program is ready immediately after `start` or `send`.
- **Screen size affects layout.** TUI apps reflow based on terminal dimensions. Set `--cols`/`--rows` to match what tests expect. Default is 80x24.
- **Capture is a snapshot.** It returns what's visible *now*. Use `--history` for full scrollback.
- **Special keys have tmux names.** `Enter`, `Escape`, `C-c`, `Up`, `Down` — not literal strings. See [references/tmux-keys.md](references/tmux-keys.md). Use `-l` flag in raw `send-keys` to type literal text.
- **Clean up sessions.** Always `kill` when done, even on failure. Leaked sessions cause name collisions.
- **$TERM is `screen` by default.** Some programs need `TERM=xterm-256color`. Prefix the command: `TERM=xterm-256color ./my-tui`.
- **Wait pattern uses extended regex.** Patterns go to `grep -qE`. Escape special chars.
- **Programs that exit immediately.** Use `wait` right after `start` to catch output before the pane closes. Pass `remain-on-exit on` via tmux if needed.
