---
description: Commit changes relevant to this conversation
argument-hint: [additional context]
---
Create a git commit for work done in this conversation.

## Scope

Only stage files you edited or created during this conversation. Ignore pre-existing unstaged changes that aren't related.

If the user asks for something else, then do that instead.

If unsure whether a file is conversation-relevant, prefer leaving it out and confirming with user.

## Process

1. Identify which files to stage
2. Run `git diff` on those files so you understand what changed.
3. Check the pattern of commit messages used in the repo.
4. Draft a good and consise commit message.
5. Stage, commit, done.

## Gotchas

- **Never auto-push.** Only commit locally unless the user explicitly asks to push.
- **Don't stage secrets** (.env, credentials, tokens). Warn if you spot any.
- **Mixed diffs**: If a file has both your changes and unrelated pre-existing changes, warn the user — they may want to commit those separately.
- **No fluff**: Add a consise summary on the commit body message but no need to make it an essay. Don't add stuff like Co-Authored by as well.
