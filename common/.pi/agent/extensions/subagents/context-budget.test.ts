/**
 * Smart-zone guardrails: spawn guidance strings, the one-shot context-budget
 * steer in the manager, and the oversized note on the parent-facing result.
 * Manager tests use scripted stub sessions; a "BIG:" spawn prompt makes the
 * stub report >=100k context tokens on every turn.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Layer, ManagedRuntime } from "effect";
import { BackendRegistry, type SubagentBackend } from "./src/backend.ts";
import { makeStubBackend } from "./src/backends/stub.ts";
import type {
  BackendName,
  ParentContext,
  SpawnTask,
  SubagentSnapshot,
} from "./src/domain.ts";
import {
  CONTEXT_BUDGET_TOKENS,
  SubagentManager,
  SubagentManagerLive,
  type SubagentManagerShape,
} from "./src/manager.ts";
import {
  buildSubagentResultMessage,
  SUBAGENT_CONTEXT_BUDGET_STEER,
  SUBAGENT_OVER_BUDGET_NOTE,
  SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS,
  SUBAGENT_SPAWN_PROMPT_GUIDELINES,
} from "./src/prompt.ts";
import { runTool } from "./src/runtime.ts";

// --- Strings --------------------------------------------------------------------

test("spawn guidance sizes children to one bounded slice", () => {
  const sizing = SUBAGENT_SPAWN_PROMPT_GUIDELINES.find((line) =>
    line.includes("bounded slice"),
  );
  assert.ok(sizing, "a guideline mentions bounded slices");
  assert.match(sizing, /100k/);
  assert.match(sizing, /parallel/);
  assert.match(sizing, /max 4/);
  assert.match(sizing, /never hand one child a multi-task plan/);
  assert.match(SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS.prompt, /one bounded slice/);
});

test("budget constant and steer text describe the wrap-up", () => {
  assert.equal(CONTEXT_BUDGET_TOKENS, 100_000);
  for (const phrase of [
    /Context budget reached/,
    /Finish only the step you are on/,
    /commit or checkpoint/,
    /what is done, what is left/,
    /suggested next slices/,
    /Do not start new work/,
  ]) {
    assert.match(SUBAGENT_CONTEXT_BUDGET_STEER, phrase);
  }
});

test("result message carries the oversized note only when over budget", () => {
  const base = {
    id: "sa-1",
    title: "slice",
    status: "done" as const,
    output: "did the thing",
  };
  const plain = buildSubagentResultMessage(base);
  assert.ok(!plain.includes(SUBAGENT_OVER_BUDGET_NOTE));
  assert.equal(
    buildSubagentResultMessage({ ...base, overBudget: false }),
    plain,
  );

  const over = buildSubagentResultMessage({ ...base, overBudget: true });
  const lines = over.split("\n");
  assert.equal(lines[0], 'Subagent sa-1 "slice" finished.');
  assert.equal(lines[1], SUBAGENT_OVER_BUDGET_NOTE);
  assert.match(lines[1], /~100k/);
  assert.match(lines[1], /smaller parallel slices/);
  assert.ok(over.endsWith("did the thing"));

  const failed = buildSubagentResultMessage({
    ...base,
    status: "error",
    errorText: "boom",
    overBudget: true,
  });
  assert.match(failed, /failed\.\nNote: .*\nError: boom\n\ndid the thing$/);
});

// --- Manager guardrail --------------------------------------------------------------

const TestRegistryLive = Layer.sync(BackendRegistry, () => {
  const backends: SubagentBackend[] = [
    makeStubBackend({
      backend: "claude",
      defaultModelLabel: "claude/sonnet",
      contextWindow: 200_000,
      toolName: "Bash",
      cadenceMs: 5,
    }),
  ];
  return new Map<BackendName, SubagentBackend>(
    backends.map((backend) => [backend.name, backend]),
  );
});

const parent: ParentContext = {
  parentCwd: process.cwd(),
  projectTrusted: false,
};

function task(prompt: string, origin?: SpawnTask["origin"]): SpawnTask {
  return { prompt, title: "budget", cwd: process.cwd(), parent, origin };
}

async function withManager(
  run: (
    manager: SubagentManagerShape,
    runtime: ManagedRuntime.ManagedRuntime<SubagentManager, never>,
  ) => Promise<void>,
) {
  const runtime = ManagedRuntime.make(
    SubagentManagerLive.pipe(Layer.provide(TestRegistryLive)),
  );
  try {
    const manager = await runtime.runPromise(SubagentManager);
    await run(manager, runtime);
  } finally {
    await runtime.dispose();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, what: string) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `timed out: ${what}`);
    await sleep(5);
  }
}

const userTexts = (snap: SubagentSnapshot | undefined) =>
  (snap?.transcript ?? []).flatMap((item) =>
    item.kind === "user" ? [item.text] : [],
  );
const steerCount = (snap: SubagentSnapshot | undefined) =>
  userTexts(snap).filter((text) => text === SUBAGENT_CONTEXT_BUDGET_STEER)
    .length;
/** Completed stub turns (two assistant messages each) once idle, else -1. */
const settledTurns = (snap: SubagentSnapshot | undefined) =>
  !snap || snap.status === "running" ? -1 : snap.turns / 2;

test("crossing the budget steers exactly once and flags the snapshot", async () => {
  await withManager(async (manager, runtime) => {
    const settles: Array<{ overBudget?: boolean }> = [];
    manager.view.setOnSettled((snap) =>
      settles.push({ overBudget: snap.overBudget }),
    );
    const snap = await runTool(
      runtime,
      manager.spawn("claude", task("BIG: refactor everything")),
    );
    const get = () => manager.view.get(snap.id);

    // Stub steers queue behind the active turn: original turn settles, then
    // the steer runs as its own turn (with usage still over budget).
    await until(() => settledTurns(get()) === 2, "steer turn settles");
    assert.equal(get()?.overBudget, true);
    assert.ok((get()?.usage.tokens ?? 0) >= CONTEXT_BUDGET_TOKENS);
    assert.equal(steerCount(get()), 1);
    assert.ok(settles.length >= 1);
    assert.ok(settles.every((s) => s.overBudget === true));

    // A later restart keeps reporting >100k but is never re-steered.
    await runTool(runtime, manager.send(snap.id, "one more thing"));
    await until(() => settledTurns(get()) === 3, "restart settles");
    await sleep(50);
    assert.equal(get()?.status, "done");
    assert.equal(steerCount(get()), 1);
    assert.deepEqual(userTexts(get()), [
      "BIG: refactor everything",
      SUBAGENT_CONTEXT_BUDGET_STEER,
      "one more thing",
    ]);
  });
});

test("children below the budget are never steered or flagged", async () => {
  await withManager(async (manager, runtime) => {
    const snap = await runTool(
      runtime,
      manager.spawn("claude", task("small slice")),
    );
    await runTool(runtime, manager.waitFor([snap.id]));
    await sleep(50);
    const done = manager.view.get(snap.id);
    assert.equal(done?.status, "done");
    assert.ok((done?.usage.tokens ?? 0) > 0);
    assert.ok((done?.usage.tokens ?? 0) < CONTEXT_BUDGET_TOKENS);
    assert.equal(done?.overBudget, undefined);
    assert.equal(steerCount(done), 0);
    assert.deepEqual(userTexts(done), ["small slice"]);
  });
});

test("by-the-way sessions are exempt from the budget steer", async () => {
  await withManager(async (manager, runtime) => {
    const snap = await runTool(
      runtime,
      manager.spawn("claude", task("BIG: side question", "btw")),
    );
    await runTool(runtime, manager.waitFor([snap.id]));
    await sleep(50);
    const done = manager.view.get(snap.id);
    assert.equal(done?.status, "done");
    assert.ok((done?.usage.tokens ?? 0) >= CONTEXT_BUDGET_TOKENS);
    assert.equal(done?.overBudget, undefined);
    assert.equal(steerCount(done), 0);
    assert.deepEqual(userTexts(done), ["BIG: side question"]);
  });
});
