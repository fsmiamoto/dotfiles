# Snapshots

After each command, playwright-cli provides a snapshot of the current browser state.

```bash
> playwright-cli goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

## On-Demand Snapshots

```bash
# default - save to file with timestamp-based name
playwright-cli snapshot

# save to specific file (useful as part of workflow results)
playwright-cli snapshot --filename=after-click.yaml

# snapshot a specific element instead of the whole page
playwright-cli snapshot "#main"

# limit depth for efficiency, then drill into a specific element
playwright-cli snapshot --depth=4
playwright-cli snapshot e34
```

All options can be combined as needed.
