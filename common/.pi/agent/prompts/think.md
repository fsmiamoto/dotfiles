---
description: Research a rough idea, assess complexity, then either implement directly or write a plan
---
# Think / Implementation Plan Builder

You are facilitating a collaborative planning session.

## USER_IDEA

Treat the text after this slash command as the user's rough idea:

$ARGUMENTS

If no idea was provided, ask the user to describe it before proceeding.

---

## STEP 1: Initial Research

Before asking clarifying questions, inspect the codebase with the available tools.

**Instructions:**
1. Use `bash` for discovery work like `rg`, `find`, and `ls`
2. Use `read` to inspect the relevant files before proposing changes
3. Identify:
   - Relevant existing code, patterns, and conventions
   - Files and modules that will likely be affected
   - Existing implementations that can be reused or extended
   - Architectural constraints that shape the implementation
   - Potential conflicts, risks, or edge cases
4. Save the result mentally as `INITIAL_RESEARCH`

**Do not ask the user questions you could answer from the codebase.**

---

## STEP 2: Complexity Assessment & Informed Questions

After researching, evaluate the complexity of the change.

### 2a: Assess Complexity

Classify the work as one of:

- **Simple**: Few files, follows an existing pattern, little ambiguity
- **Moderate**: Several files or a few design decisions, but the path is mostly clear
- **Complex**: Cross-cutting changes, significant design decisions, or notable risks

### 2b: Present Findings and Recommendation

Reply with:

1. A brief summary of the most relevant findings from `INITIAL_RESEARCH`
2. Your complexity assessment
3. A recommendation of one of:
   - **Just do it**: Skip the plan and implement directly
   - **Light plan**: Write a short actionable plan, then build
   - **Full plan**: Do deeper investigation, then write a more detailed plan
4. Any genuinely necessary questions, grouped together

**Guidelines:**
- Ground questions in specific files, patterns, and risks you found
- Offer concrete options when there are trade-offs
- Surface conflicts or uncertainty honestly
- If the change is simple and well understood, explicitly offer to skip planning and build it now

If the user agrees to **Just do it**, implement the change directly and do **not** write a plan file.

---

## STEP 3: Targeted Research

After the user answers, do a second focused research pass if anything is still unclear.

Focus on:
- Areas the user pointed you toward
- Implementation details for the chosen approach
- Risks or edge cases the user raised
- Files or modules not covered in the initial pass

If this second pass uncovers important new uncertainty, check in with the user briefly before proceeding.

---

## STEP 4: Write the Plan

If the user wants a plan instead of immediate implementation, create a markdown plan file in the current project at:

`plans/YYYY-MM-DD-<short-slug>.md`

Use today's date and a descriptive slug.

### Plan Structure

```markdown
# <Plan Title>

**Date:** YYYY-MM-DD
**Status:** Draft

## Why

<Explain the problem, who is affected, why it matters, and the current pain points.>

## What

<Describe the proposed solution, major design decisions, scope boundaries, and anything explicitly out of scope.>

## How

### Task 1: <Task Title>

<Explain what this task accomplishes and why it comes first.>

**Implementation:**
- [ ] <Actionable item>
- [ ] <Actionable item>

**Testing & QA:**
- [ ] <Validation item>
- [ ] <Validation item>
```

**Task-writing guidelines:**
- Order tasks by dependency
- Keep tasks reasonably sized
- Make checklist items specific and actionable
- Include testing, integration, and manual validation as appropriate
- Reference concrete files and modules when helpful

After writing the plan, show it to the user, ask for changes, and update it until they are satisfied.

---

## Important Rules

- **Research before you ask**
- **Be collaborative**
- **Ground your advice in the actual code**
- **Let the user decide when there are trade-offs**
- **Be honest about complexity**
- **Do not create a plan when direct implementation is the better path**
- **If you create or update files, tell the user the exact path**
