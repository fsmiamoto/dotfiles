// Run: node common/.pi/agent/extensions/subagents/budget.uat.ts
// Real Pi SDK + subagents extension + Pi child backend; isolated offline provider.
// "big": child reports >=100k context -> one wrap-up steer, oversized note on the
// single parent-facing result. "control": small child -> no steer, no note.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SUBAGENT_CONTEXT_BUDGET_STEER, SUBAGENT_OVER_BUDGET_NOTE } from "./src/prompt.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const fixture = join(extensionDir, "fixtures/budget-uat-provider.ts");
const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const sdk = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function scenario(kind: "big" | "control") {
  const cwd = mkdtempSync(join(tmpdir(), `pi-subagents-budget-uat-${kind}-`));
  const agentDir = join(cwd, "agent");
  mkdirSync(agentDir);
  writeFileSync(join(cwd, "scenario"), kind);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ extensions: [fixture], compaction: { enabled: false }, retry: { enabled: false } }));
  const trace = () => existsSync(join(cwd, "budget-trace.jsonl")) ? readFileSync(join(cwd, "budget-trace.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  const errors: unknown[] = [];
  const reports: any[] = [];
  let runtime: any;
  const createRuntime = async (options: any) => {
    const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager: sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }), resourceLoaderOptions: {
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalExtensionPaths: [fixture, join(extensionDir, "index.ts")],
    } });
    const result = await sdk.createAgentSessionFromServices({ services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent,
      model: services.modelRuntime.getModel("anthropic", "budget-uat-parent"), thinkingLevel: "off" });
    assert.equal(result.extensionsResult.errors.length, 0, JSON.stringify(result.extensionsResult.errors));
    result.session.subscribe((event: any) => { if (event.type === "message_start" && event.message.customType === "subagent-result") reports.push(event.message); });
    return { ...result, services, diagnostics: services.diagnostics };
  };
  const until = async (check: () => boolean, what: string) => {
    const deadline = Date.now() + 30_000;
    while (!check()) {
      assert.ok(Date.now() < deadline, `[${kind}] timed out: ${what}; cwd=${cwd}; trace=${JSON.stringify(trace().slice(-6))}`);
      assert.equal(errors.length, 0, JSON.stringify(errors));
      await sleep(20);
    }
  };
  try {
    runtime = await sdk.createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager: sdk.SessionManager.create(cwd, join(agentDir, "sessions")) });
    await runtime.session.bindExtensions({ mode: "sdk", onError: (error: unknown) => { errors.push(error); console.error(error); }, commandContextActions: {
      waitForIdle: () => runtime.session.agent.waitForIdle(), newSession: async () => ({ cancelled: true }), fork: async () => ({ cancelled: true }),
      switchSession: async () => ({ cancelled: true }), navigateTree: async () => ({ cancelled: true }), reload: async () => {},
    } });
    await runtime.session.prompt(`Delegate one ${kind} slice to a Pi child and integrate its report.`);
    await until(() => trace().some(row => row.event === "parent_request" && row.report), "parent ingests child report");
    await runtime.session.agent.waitForIdle();
    await sleep(1_500); // grace window: a stray re-steer/restart would produce more requests or reports
    assert.equal(errors.length, 0, JSON.stringify(errors));

    const child = trace().filter(row => row.event === "child_request");
    const parentSawReport = trace().filter(row => row.event === "parent_request" && row.report);
    assert.equal(child.length, 2, `[${kind}] child ran exactly tool turn + report turn: ${JSON.stringify(child)}`);
    assert.equal(reports.length, 1, `[${kind}] exactly one subagent-result delivered`);
    assert.equal(parentSawReport.length, 1, `[${kind}] parent ingested the report once`);
    const content = typeof reports[0].content === "string" ? reports[0].content : JSON.stringify(reports[0].content);
    assert.match(content, new RegExp(`CHILD_REPORT_${kind}`));
    assert.equal(reports[0].details.status, "done");
    const checks: string[] = [];
    if (kind === "big") {
      assert.ok(child.every(row => row.big), "child prompt carried BIG-SLICE marker");
      assert.equal(child[0].steers, 0, "first child request precedes the steer");
      assert.equal(child[1].steers, 1, "child's next request contains exactly one wrap-up steer");
      assert.ok(content.includes(SUBAGENT_OVER_BUDGET_NOTE), "result carries oversized note");
      assert.equal(content.split("\n")[1], SUBAGENT_OVER_BUDGET_NOTE, "note is first line after header");
      assert.ok(parentSawReport[0].note, "parent model context contains the oversized note");
      checks.push("child usage >=100k triggers wrap-up steer in its next request", "steer sent exactly once", "exactly one subagent-result with oversized note", "parent model sees the note");
    } else {
      assert.ok(child.every(row => !row.big && row.steers === 0), "control child never steered");
      assert.ok(!content.includes(SUBAGENT_OVER_BUDGET_NOTE), "control result has no oversized note");
      assert.ok(!parentSawReport[0].note, "control parent context has no note");
      assert.ok(!content.includes(SUBAGENT_CONTEXT_BUDGET_STEER));
      checks.push("below-budget child gets no steer", "exactly one subagent-result without oversized note");
    }
    return { kind, cwd, checks };
  } finally {
    await runtime?.dispose();
  }
}

const results = [await scenario("big"), await scenario("control")];
console.log(JSON.stringify({ result: "PASS", scenarios: results }, null, 2));
