---
name: playwright-cli
description: Automate browser interactions, test web pages and work with Playwright tests. Use when the user wants to browse the web, interact with a webpage, test a web application, fill forms, take screenshots, or automate browser tasks. Keywords - browser, web, click, navigate, screenshot, playwright, test.
---

# Browser Automation with playwright-cli

## Quick Start

```bash
playwright-cli open https://example.com   # open browser
playwright-cli snapshot                    # get page state with element refs
playwright-cli click e15                   # interact using refs
playwright-cli fill e5 "text" --submit     # fill + Enter
playwright-cli close                       # close browser
```

## Core Workflow

`open` → `snapshot` (get refs) → interact via refs → `snapshot` (verify) → `close`

Every command returns a snapshot automatically. Use refs (e.g. `e15`) from the **latest** snapshot to target elements.

## Gotchas

- Element refs change between snapshots — always use refs from the most recent one
- `snapshot` > `screenshot` — structured data is more useful than pixels
- Use `--submit` with `fill` to auto-press Enter (search/login forms)
- If `playwright-cli` not available globally, use `npx playwright-cli` instead
- Use `--raw` to get machine-readable output for piping to other tools
- For persistent browser state across sessions, use `--persistent` with `open`
- Install with `npm install -g @playwright/cli@latest` if missing

## References

- **[Commands](references/commands.md)** — Full command reference (core, navigation, keyboard, mouse, tabs, save)
- **[Snapshots](references/snapshots.md)** — Snapshot options, depth control, partial snapshots
- **[Targeting elements](references/targeting.md)** — Refs, CSS selectors, Playwright locators
- **[Sessions & browsers](references/sessions.md)** — Named sessions, browser choice, persistent profiles, installation
- **[Storage](references/storage.md)** — Cookies, localStorage, sessionStorage, state save/load
- **[Network mocking](references/network.md)** — Route interception, response mocking
- **[DevTools](references/devtools.md)** — Console, network logs, eval, run-code, tracing, video
- **[Raw output](references/raw-output.md)** — `--raw` flag for scripting and piping
- **[Examples](references/examples.md)** — Form submission, multi-tab, debugging workflows
- **[Playwright tests](references/playwright-tests.md)** — Running and debugging tests
- **[Test generation](references/test-generation.md)** — Generating tests from interactions
