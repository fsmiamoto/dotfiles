---
description: Run an elite software engineering workflow to deliver on `USER_PROMPT`
argument-hint: [user prompt] [documentation urls]
---
# Research Plan Build

You are executing a structured development workflow that follows these EXACT steps in order. These steps CANNOT be skipped.

## USER_PROMPT

Extract the user's goal/task from the message following this slash command invocation. This is the USER_PROMPT that will be used throughout the workflow.

If the user hasn't provided their goal yet, ask them to describe:
- What they want to build or implement
- Any relevant documentation links or files
- Specific constraints or requirements
- Areas of the codebase to focus on

Once you have the USER_PROMPT, proceed with Step 1.

---

## STEP 1: Clarifying questions

Based on the extract user goal/task, you can ask any initial clarifying questions.

**Instructions:**
1. Use the available planning tools you have to ask clarifying questions
2. Save the answers you get into CLARIFYING_QUESTIONS
---

---

## STEP 1: Research Agent - Identify Relevant Files

Launch the **research** agent to identify all relevant files and code sections for the USER_PROMPT.

**Instructions:**
1. Use the Task tool with `subagent_type="researh"`
2. Pass the USER_PROMPT as the task description alongside any of the questions at CLARIFYING_QUESTIONS
3. The research will return a JSON array of relevant files with line numbers
4. Save this output as RESEARCH_RESULTS for use in the next step

**Do NOT proceed to Step 2 until the research agent has completed and returned results.**

---

## STEP 2: Planner Agent - Create Implementation Plan

Launch the **planner** agent to create a detailed implementation plan.

**Instructions:**
1. Use the Task tool with `subagent_type="planner"`
2. Construct the planning prompt with:
   - The original USER_PROMPT
   - The RESEARCH_RESULTS (list of relevant files and line numbers)
   - **IMPORTANT**: Any documentation links or files mentioned in the USER_PROMPT must be explicitly highlighted and included in your prompt to the planner agent
3. The planner will create a comprehensive plan and save it to the `plans/` directory
4. Save the plan file path as PLAN_PATH for the next steps

**Do NOT proceed to Step 3 until the planner agent has completed and saved the plan.**

---

## STEP 3: Review Plan with Reagent MCP

Use the reagent MCP server's review tools to get user approval on the plan.

**Instructions:**
1. Call `mcp__reagent__create_review` with the PLAN_PATH to create a review session
   - You should create the review using the `source: local` since we don't commit the plan file to Git.
   - Make sure to pass the file path to the PLAN_PATH.
2. Call `mcp__reagent__get_review` with the `sessionId` and `wait: true` to block until review completes
   - This waits for the user to complete their review in the browser
3. **Check the review status**:
   - If `status === "approved"`: Proceed to Step 4
   - If `status === "changes_requested"`:
     - Read the `generalFeedback` and `comments` from the review result
     - **MANDATORY**: Re-launch the planner agent with:
       - Original USER_PROMPT
       - SCOUT_RESULTS
       - User's feedback from `generalFeedback`
       - Specific issues from `comments` array
     - Get the updated PLAN_PATH
     - Call `create_review` + `get_review` again on the updated plan
     - **REPEAT this loop** until status is "approved"

**CRITICAL**:
- Do NOT proceed to Step 4 until the plan status is EXPLICITLY "approved"
- Do NOT skip the re-planning step when changes are requested
- ALWAYS include the user's feedback when re-launching the planner
- The loop MUST continue until approval is achieved

---

## STEP 4: Builder Agent - Implement the Plan

Launch the **builder** agent to implement the approved plan.

**Instructions:**
1. Use the Task tool with `subagent_type="builder"`
2. Provide the builder with:
   - The PLAN_PATH (path to the approved plan file)
   - Clear instructions to implement each phase of the plan
   - Reminder to maintain code quality standards from the builder agent definition
3. The builder will implement the plan systematically
4. The builder will update the plan file with checkmarks as tasks are completed

**Do NOT proceed to Step 5 until the builder agent has completed all implementation tasks.**

---

## STEP 5: Review Implementation with Reagent MCP

Use the reagent MCP server's review tools to validate the implementation.

**Instructions:**
1. Call `mcp__reagent__create_review` with `source: "uncommitted"` to review all uncommitted changes
   - This returns immediately with a `sessionId` and `reviewUrl`
2. Call `mcp__reagent__get_review` with the `sessionId` and `wait: true` to block until review completes
   - This waits for the user to complete their review in the browser
3. **Check the review status**:
   - If `status === "approved"`: Workflow is complete! Proceed to completion message
   - If `status === "changes_requested"`:
     - Read the `generalFeedback` and `comments` from the review result
     - **MANDATORY**: Re-launch the builder agent with:
       - The PLAN_PATH (same plan)
       - User's feedback from `generalFeedback`
       - Specific issues from `comments` array (file paths and line numbers)
       - Explicit instructions to address each issue raised
     - Call `create_review` + `get_review` again on the updated changes
     - **REPEAT this loop** until status is "approved"

**CRITICAL**:
- Do NOT mark workflow as complete until implementation status is EXPLICITLY "approved"
- Do NOT skip the builder re-run when changes are requested
- ALWAYS include the user's specific feedback (both general and line-specific comments)
- The loop MUST continue until approval is achieved
- The builder should FIX the issues, not just acknowledge them

---

## Workflow Complete

Once Step 5 is approved, inform the user that the workflow is complete:

```
✅ Workflow Complete!

All phases have been completed:
1. ✅ Scout identified relevant files
2. ✅ Planner created implementation plan (approved)
3. ✅ Builder implemented the plan (approved)

Plan location: [PLAN_PATH]
```

---

## Important Rules

- **NO SKIPPING STEPS**: Each step must complete before moving to the next
- **WAIT FOR AGENTS**: Do not proceed until each agent reports completion
- **REVIEW LOOPS ARE MANDATORY**: Steps 3 and 5 MUST loop until status is "approved"
  - Never proceed with "changes_requested" status
  - Always re-run the planner/builder when changes are requested
  - Include ALL user feedback in the re-run prompt
- **PRESERVE CONTEXT**: Pass scout results to planner, pass plan to builder
- **DOCUMENTATION AWARENESS**: When user provides doc links/files, explicitly ensure planner reviews them
- **USE MCP TOOLS**: Always use `mcp__reagent__create_review` + `mcp__reagent__get_review` for reviews (not manual prompts)
- **FEEDBACK HANDLING**: Extract and pass both `generalFeedback` and `comments` array to subagents during re-runs
