---
description: Create a detailed implementation plan from a rough idea through collaborative refinement
argument-hint: [rough idea or feature description]
---
# Implementation Plan Builder

You are facilitating a collaborative planning session. Your goal is to deeply understand and think about the user's idea and produce a well-structured implementation plan saved as a markdown file.

## USER_IDEA

Extract the user's rough idea from the message following this slash command invocation.

If no idea was provided, use AskUserQuestion to ask the user to describe their idea before proceeding.

---

## STEP 1: Initial Research

Before asking the user anything, launch the **researcher** agent to explore the codebase for context relevant to USER_IDEA.

**Instructions:**
1. Use the Agent tool with `subagent_type="researcher"`
2. Pass the USER_IDEA as the task description
3. Ask the researcher to identify:
   - Relevant existing code, patterns, and conventions
   - Files and modules that will likely be affected
   - Any existing implementations that could be reused or extended
   - Architectural patterns and constraints that would shape the implementation
   - Potential conflicts or risks based on the current codebase state
4. Save the research output as INITIAL_RESEARCH

**Do NOT proceed until the researcher agent has completed.**

---

## STEP 2: Complexity Assessment & Informed Questions

After researching, evaluate the complexity of the change and present your findings to the user.

### 2a: Assess Complexity

Based on INITIAL_RESEARCH, honestly evaluate how complex this change is. Consider:
- How many files need to change?
- Are there architectural decisions to make, or is the path obvious?
- Are there risks, edge cases, or non-obvious interactions?
- Does this follow an existing pattern that's already well-established in the codebase?

Classify as one of:
- **Simple**: Few files, follows an existing pattern, no real design decisions needed. Example: adding a new field that mirrors existing ones, fixing a straightforward bug.
- **Moderate**: Several files, some decisions to make, but the overall approach is clear.
- **Complex**: Many files, significant design decisions, cross-cutting concerns, or risks.

### 2b: Present Findings and Recommendation

Share your research findings and complexity assessment with the user. Use AskUserQuestion to:

1. **Summarize what you found** — briefly share the most relevant findings so the user knows you've done the groundwork.
2. **State your complexity assessment** and recommend one of:
   - **"Just do it"** (Simple): You have enough context to implement directly. Offer to skip the plan and go straight to building. If the user agrees, proceed directly to implementation using the builder agent — do NOT write a plan.
   - **"Light plan"** (Moderate): A quick plan with a few tasks, then build. Proceed to Step 3 if the user agrees.
   - **"Full plan"** (Complex): The full planning workflow with targeted research. Proceed to Step 3 if the user agrees.
3. **Ask your questions** — regardless of complexity, ask any questions you genuinely need answered. But calibrate the depth:
   - For simple changes: maybe just 1-2 confirming questions, or none at all
   - For complex changes: thorough questions covering motivation, scope, and technical approach

**Question categories** (use as needed, not all required):

*Motivation* (grounded in what you found):
- What problem does this solve? Who is affected?
- What does success look like?
- Are there any deadlines, dependencies, or constraints?

*Technical* (grounded in INITIAL_RESEARCH):
- Reference specific files, patterns, or existing implementations you found and ask about preferred approaches
- Clarify scope boundaries — what is explicitly in and out of scope
- Ask about edge cases, error handling expectations, or performance concerns
- Highlight architectural decisions surfaced by the research and ask the user to weigh in

**Instructions:**
- Group related questions together rather than asking one at a time
- Reference specific files or patterns from INITIAL_RESEARCH — don't ask generic questions you could have asked without reading the code
- If you spot potential conflicts or risks in the codebase, surface them
- If the user is unsure about something, offer concrete options with trade-offs
- Ask as many rounds as needed until you have a clear picture, but aim to get most of it in the first round
- Save the user's answers as USER_ANSWERS
- **If the user agrees to "Just do it"**: Skip Steps 3 and 4 entirely. Launch the builder agent with USER_IDEA, INITIAL_RESEARCH, and USER_ANSWERS. You are done.

---

## STEP 3: Targeted Research

Based on the user's answers, launch a **second research pass** to fill in gaps and explore areas the user pointed you toward.

**Instructions:**
1. Use the Agent tool with `subagent_type="researcher"`
2. Include the original USER_IDEA, INITIAL_RESEARCH, and USER_ANSWERS
3. Focus this research on:
   - Specific areas the user mentioned or redirected you toward
   - Implementation details for the approach the user chose
   - Edge cases or risks the user raised
   - Any files or modules referenced in USER_ANSWERS that weren't covered in INITIAL_RESEARCH
4. Save the combined research as RESEARCH_RESULTS (merge with INITIAL_RESEARCH)

**Do NOT proceed until the researcher agent has completed.**

If the second research raises new questions or concerns, briefly check in with the user using AskUserQuestion before proceeding.

---

## STEP 4: Write the Plan

Generate a markdown plan file and save it to the `plans/` directory in the current project.

**Instructions:**
1. Create the `plans/` directory if it doesn't exist
2. Name the file `plans/YYYY-MM-DD-<short-slug>.md` using today's date and a descriptive slug derived from the idea
3. Write the plan following the structure below
4. After writing, show the user the full plan and ask if they'd like any changes
5. If the user requests changes, update the file and repeat until they are satisfied

### Plan Structure

```markdown
# <Plan Title>

**Date:** YYYY-MM-DD
**Status:** Draft

## Why

<A clear explanation of the problem this solves, who is affected, why it matters, and what the current pain points are. This should be compelling enough that someone reading it understands the motivation without additional context.>

## What

<A high-level overview of the solution. Describe the approach, key design decisions, and scope boundaries. This section should give a reader a mental model of the change without getting into step-by-step details. Mention what is explicitly out of scope if relevant.>

## How

### Task 1: <Task Title>

<Brief description of what this task accomplishes and why it comes at this point in the sequence.>

**Implementation:**
- [ ] <Actionable item>
- [ ] <Actionable item>
- [ ] ...

**Testing & QA:**
- [ ] <Unit test, integration test, or manual validation item>
- [ ] ...

### Task 2: <Task Title>

...repeat for each task...
```

**Guidelines for writing tasks:**
- Order tasks by dependency — earlier tasks should not depend on later ones
- Each task should be reasonably sized (completable in a focused session)
- Implementation checklist items should be specific and actionable, not vague
- Testing & QA items should cover unit tests, integration tests, and manual validation as appropriate for the task
- Reference specific files and modules from RESEARCH_RESULTS where helpful

---

## Important Rules

- **RESEARCH BEFORE YOU ASK**: Never ask the user a question you could have answered by reading the code. Do your homework first.
- **BE COLLABORATIVE**: This is a conversation, not a monologue. Ask questions, validate understanding, and iterate.
- **DON'T RUSH**: Take as many rounds of questions as needed. A good plan requires a deep understanding.
- **GROUND IN CODE**: Use research results to make questions and the plan concrete and actionable rather than generic.
- **USER DECIDES**: When there are trade-offs, present options and let the user choose. Don't make assumptions about preferences.
- **ITERATE THE PLAN**: After writing, actively ask for feedback and refine until the user is satisfied.
