# Task: [Name]

## What

[What this task accomplishes in the context of the plan]

## Files

- `path/to/file.ts:L42-L78` — [what changes here]

## Implementation

[Describe intent in prose. Reference files and line numbers from research. Signatures help — include them.

Write the task the way you'd brief a competent teammate. You wouldn't hand them the full implementation pre-written — you'd describe what to build and call out the non-obvious parts. Skip function bodies, loss formulas, training loops, routine class field defaults, argparse tables. Inline code only when it surfaces something the prose can't carry: a research finding, a constraint, a math formula, a pattern to mimic, a before/after transform.]

<!--
Example of a well-shaped Implementation section:

  parseQuery(input: string) -> Query | ParseError parses URL query strings
  using the tokenizer from lib/tokens.ts:L40-L80. Return ParseError for inputs
  with nested brackets — the spec rules them out, and the tokenizer asserts
  on them rather than handling them gracefully.

The signature pins the contract. The file:line pins where to plug in. The
nested-bracket rule is a research finding worth surfacing. Everything else —
the parsing loop, error construction, whitespace edge cases — the builder
writes.

Link to context or snippets only when relevant to this task.
-->

## Verify

- [ ] [How to verify this task is done correctly]
