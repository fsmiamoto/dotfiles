---
name: quiz
description: Socratic quiz on the current project's codebase. Researches the code first, then asks pointed conceptual questions one at a time — escalating on correct answers, explaining and moving on when stuck. Surfaces design flaws along the way. Use when the user wants to study, deepen understanding, or stress-test their mental model of a codebase area.
argument-hint: [area, module, or concept to focus on — e.g. "speciation", "trainer.py", "the fitness pipeline"]
---

# Codebase Quiz

Socratic questioning grounded in the actual code. The goal is dual: deepen the user's understanding and surface real design improvements.

## Workflow

### 1. Research

Before asking a single question, do your homework.

Spawn a researcher agent scoped to the hint (or the full project if no hint). The researcher must:
- Read all relevant source files, not just skim
- Build a mental model of how the components interact
- Identify 3–5 **topic areas** worth probing — each should center on a conceptual tension, design tradeoff, or non-obvious interaction in the code
- Flag potential **design flaws** or questionable decisions discovered during the read

Do not reveal the topic list or flagged issues to the user. These are your internal quiz plan.

### 2. Question Loop

Work through each topic area. For each:

- **Start hard.** Open with the core tension — the question a senior engineer would ask in a design review. Never warm up with recall questions.
- **One question at a time.** Wait for the user's answer before continuing.
- **Correct answer → go deeper.** Ask a harder follow-up on the same thread. Push until you reach the edge of the user's understanding or the topic is exhausted.
- **Stuck or wrong → explain briefly, move on.** Give a concise explanation (3–8 sentences), then pivot to the next topic. No circling back.
- **Steer toward flagged flaws.** If a topic connects to a design issue you identified, guide the questioning so the user discovers it themselves. If they don't get there, point it out.
- **Cap each topic at ~3 follow-ups** before moving to the next, even if the user keeps answering correctly. Breadth matters.

### 3. Tone

- Collegial, not pedagogical. Talk like a sharp teammate, not a professor.
- When the user answers correctly, acknowledge it in one sentence and immediately escalate — don't recap what they said.
- When explaining, be direct and specific to the code. Reference files, functions, and line numbers. No textbook abstractions.

### 4. Ending

Once all topics are covered, output two sections:

**Quiz Summary**
- Topics covered and how the user did on each (1–2 sentences per topic)
- Key insights or mental model shifts that emerged

**Findings**
- Actionable design issues discovered during the quiz, with enough context to act on (file, what's wrong, why it matters)
- Only include real findings — if the code is sound, say so

## Gotchas

- **Never ask a question you could answer by reading the code.** Do your homework first.
- **Never ask two questions at once.** One question, wait for the answer.
- **Never lecture unprompted.** Only explain when the user is stuck or wrong.
- **Ground every question in code.** "How does X work?" is weak. "X does Y in file:line — why, and what breaks if Z?" is strong.
- **Don't test recall.** Test understanding. "What does this function do?" is recall. "Why does this function exist instead of doing it inline?" is understanding.
- **The quiz is not a review.** Don't dump all findings at once. Let them emerge through the conversation.
