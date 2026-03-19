---
description: Review a skill, agent definition, or prompt for quality and effectiveness
---
# Prompt & Skill Reviewer

Review the given skill, agent definition, or prompt for effectiveness. Read the file first if a path is provided.

$ARGUMENTS

## What to look for

- **Stating the obvious** — Does it tell the model things it already knows? Generic coding advice, standard practices, textbook principles? Every line should earn its place.
- **Railroading** — Is it overly prescriptive with rigid step-by-step instructions? Could the model achieve the same goal with principles and guardrails instead of a script?
- **Missing gotchas** — The highest-signal content is what goes *wrong*. Does it have a gotchas section? Are the gotchas specific and grounded, or generic?
- **Signal-to-noise ratio** — How much of the content actually changes behavior vs. how much is filler? Shorter is almost always better.
- **Description quality** (for skills) — Is the description written for *triggering*, not summarizing? Does it include "Use when..." with specific keywords?
- **Progressive disclosure** (for skills) — Should any content be split into reference files? Is SKILL.md under 100 lines?
- **Over-specification vs. under-specification** — Are constraints too tight (limiting good solutions) or too loose (inviting drift)?

## Output format

1. **Verdict** — One line: how effective is this prompt overall?
2. **Cut these** — Specific lines/sections that state the obvious or railroad. Quote them.
3. **Add these** — Missing gotchas or guardrails that would actually change behavior.
4. **Rewrite** — Offer a trimmed version if the changes are significant.

## Gotchas

- **Don't just nitpick.** If the prompt is already lean and effective, say so.
- **Judge by the task, not a formula.** A 5-line prompt can be perfect. A 100-line prompt can be justified. Length isn't the metric — signal density is.
- **Simple prompts don't need gotchas sections.** Not everything needs the full skill treatment.
