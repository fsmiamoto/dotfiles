# Browser Sessions

## Named Sessions

```bash
# create named session with persistent profile
playwright-cli -s=mysession open example.com --persistent
# with manual profile directory
playwright-cli -s=mysession open example.com --profile=/path/to/profile
playwright-cli -s=mysession click e6
playwright-cli -s=mysession close
playwright-cli -s=mysession delete-data
```

## Session Management

```bash
playwright-cli list
playwright-cli close-all
playwright-cli kill-all          # forcefully kill all browser processes
```

## Open Parameters

```bash
# browser choice
playwright-cli open --browser=chrome
playwright-cli open --browser=firefox
playwright-cli open --browser=webkit
playwright-cli open --browser=msedge

# persistent profile (default is in-memory)
playwright-cli open --persistent
playwright-cli open --profile=/path/to/profile

# connect via extension
playwright-cli attach --extension

# start with config
playwright-cli open --config=my-config.json

# cleanup
playwright-cli close
playwright-cli delete-data       # delete user data for default session
```

## Installation

If `playwright-cli` is not available globally, try local:

```bash
npx --no-install playwright-cli --version
```

If local is available, use `npx playwright-cli` for all commands. Otherwise install globally:

```bash
npm install -g @playwright/cli@latest
```
