# ReAgent CLI Reference

## Review Sources

### Uncommitted changes (default)
```bash
reagent review --auto-start
```

### Specific commit
```bash
reagent review --auto-start --source=commit --commit=abc123
```

### Branch comparison
```bash
reagent review --auto-start --source=branch --base=main --head=feature
```

### Local files (no git needed)
```bash
reagent review --auto-start --source=local src/app.ts src/utils.ts
```

## `reagent review` Flags

| Flag | Description |
|------|-------------|
| `--auto-start` | Start the server if not running (always use this) |
| `-s, --source <type>` | `uncommitted` (default), `commit`, `branch`, or `local` |
| `--commit <hash>` | Commit hash (required for `--source=commit`) |
| `--base <ref>` | Base branch/ref (required for `--source=branch`) |
| `--head <ref>` | Head branch/ref (required for `--source=branch`) |
| `--title <string>` | Review title shown in the UI |
| `--description <string>` | Review description shown in the UI |
| `--no-open` | Don't open browser (avoid using this) |

### Output format
```
[Reagent] Review created: http://localhost:3636/review/SESSION_ID
```
The session ID is the UUID at the end of the URL.

## `reagent get` Flags

| Flag | Description |
|------|-------------|
| `--wait` | Block until the review is submitted (polls every 1s, 10min timeout) |
| `--json` | Output as JSON (always use with `--wait`) |

### JSON Output Schema

```json
{
  "id": "uuid",
  "title": "Review title",
  "description": "Review description",
  "status": "approved | changes_requested | pending | cancelled",
  "generalFeedback": "Overall feedback text from the reviewer",
  "comments": [
    {
      "id": "uuid",
      "filePath": "src/app.ts",
      "startLine": 10,
      "endLine": 12,
      "side": "new",
      "text": "This should handle the error case",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "files": [
    {
      "path": "src/app.ts",
      "content": "... current file content ...",
      "oldContent": "... previous file content ...",
      "language": "typescript"
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "completedAt": "2025-01-01T00:05:00.000Z"
}
```

### Comment Fields

| Field | Description |
|-------|-------------|
| `filePath` | Relative path of the file the comment is on |
| `startLine` | First line of the commented range (1-indexed) |
| `endLine` | Last line of the commented range (same as startLine for single-line) |
| `side` | `"new"` = current code, `"old"` = previous version |
| `text` | The comment body |

## Server Management

These are rarely needed since `--auto-start` handles it, but available if needed:

```bash
reagent status              # Check if server is running
reagent start --detach      # Start server in background
reagent stop                # Stop the server
reagent list                # List active review sessions
```

The server runs on port 3636 by default (override with `--port` or `REAGENT_PORT` env var).
