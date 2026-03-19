---
description: Run a Research → Plan → Build workflow with review gates at each stage
---
# Research Plan Build

You are executing a structured development workflow. Follow these steps in order. Do not skip steps.

## USER_PROMPT

$ARGUMENTS

If no goal was provided, ask the user to describe:
- What they want to build or implement
- Any relevant documentation links or files
- Specific constraints or requirements

---

## STEP 1: Research

Thoroughly explore the codebase to identify all relevant context.

1. Use `bash` (`rg`, `find`, `ls`) and `read` to inspect the codebase
2. Identify: relevant files with line numbers, existing patterns, architectural constraints, risks
3. Save your findings mentally as RESEARCH_RESULTS
4. Ask any clarifying questions that can't be answered from the code

---

## STEP 2: Write the Plan

Create a detailed implementation plan based on your research.

1. Save the plan to `plans/YYYY-MM-DD-<slug>.md`
2. Include:
   - The original goal and context
   - Relevant findings from research (specific files and line numbers)
   - Ordered tasks with implementation and testing checklists
   - Design decisions and trade-offs
3. If the user provided documentation links, explicitly reference them

---

## STEP 3: Review the Plan

Present the plan to the user and get explicit approval.

1. Show the user the plan file path and a summary
2. Ask: "Approve this plan, or request changes?"
3. **If changes requested**: Update the plan based on feedback. Repeat until approved.
4. **Do NOT proceed to building until the user explicitly approves.**

---

## STEP 4: Build

Implement the approved plan.

1. Work through each task in the plan systematically
2. Update the plan file with checkmarks as tasks are completed
3. Maintain code quality: tests, error handling, consistent style

---

## STEP 5: Review the Implementation

Ask the user to review the implementation.

1. Summarize what was implemented and which files changed
2. Ask: "Approve this implementation, or request changes?"
3. **If changes requested**: Address the feedback, then ask for review again. Repeat until approved.

---

## Workflow Complete

Once Step 5 is approved:

```
✅ Workflow Complete!

1. ✅ Research identified relevant files
2. ✅ Plan created and approved
3. ✅ Implementation complete and approved

Plan location: [path]
```

## Rules

- **No skipping steps.** Each step must complete before the next.
- **Review loops are mandatory.** Steps 3 and 5 loop until the user explicitly approves.
- **Ground everything in code.** Reference specific files, patterns, and implementations.
- **Documentation awareness.** When the user provides doc links/files, review them during research.
