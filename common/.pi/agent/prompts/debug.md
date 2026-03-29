---
description: Debug a problem collaboratively by gathering evidence, forming hypotheses, and narrowing down the root cause
---
# Debug

The user has a problem they need help debugging.

<user_input>
$ARGUMENTS
</user_input>

## Approach

1. **Gather evidence first** — Read logs, error messages, stack traces, and relevant code before forming any theory. Reproduce the issue if possible.
2. **Form hypotheses** — Based on the evidence, list 2-3 plausible root causes ranked by likelihood.
3. **Narrow down** — For each hypothesis, identify what evidence would confirm or rule it out. Run targeted checks (grep, read, bash) to eliminate candidates.
4. **Propose a fix** — Once the root cause is identified, explain it clearly and suggest a fix. Get user approval before making changes.

## Gotchas

- **Never guess without evidence.** The #1 failure mode is pattern-matching on keywords and jumping to a fix. Investigate first.
- **Read the actual error, not what you expect it to say.** Off-by-one in stack traces, swallowed exceptions, and misleading error messages are common.
- **Check the obvious first.** Typos, wrong env, stale cache, wrong branch — rule these out early before going deep.
- **Ask the user what changed.** The most useful debugging question is "what was the last thing you changed before it broke?"
- **Don't change code to debug.** Use read-only investigation (logs, grep, read) until you have a confirmed root cause.
