// Run: node common/.pi/agent/extensions/go/subagents.uat.ts
// Real Pi SDK, /go, subagents manager and Pi child backend; isolated offline provider.
import assert from "node:assert/strict";
import { goPath, readState, type GoState } from "./core.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const cwd = mkdtempSync(join(tmpdir(), "pi-go-subagents-uat-"));
const agentDir = join(cwd, "agent");
// Keep acceptance-test notifications out of the user's live terminal.
mkdirSync(join(cwd, "bin"));
writeFileSync(join(cwd, "bin/cmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
process.env.PATH = `${join(cwd, "bin")}:${process.env.PATH ?? ""}`;
mkdirSync(join(cwd, ".pi/go"), { recursive: true });
mkdirSync(agentDir);
const fixture = join(extensionDir, "fixtures/subagents-uat-provider.ts");
process.env.PI_CODING_AGENT_DIR = agentDir;
writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ extensions: [fixture], compaction: { enabled: false }, retry: { enabled: false } }));
const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const sdk = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
let lastState: GoState | undefined;
const state = () => {
  const owned = readState(cwd, runtime?.session.sessionManager.getSessionFile());
  if (owned) lastState = owned;
  else if (lastState) lastState = JSON.parse(readFileSync(goPath(cwd, "state.json", lastState.runId), "utf8"));
  return lastState!;
};
const runPath = (file: string) => goPath(cwd, file, state().runId);
const trace = () => existsSync(join(cwd, "subagents-trace.jsonl")) ? readFileSync(join(cwd, "subagents-trace.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
writeFileSync(join(cwd, ".pi/go/config.json"), JSON.stringify({ resetThresholdTokens: 20_000, reviewer: { model: "go-subagent-uat-reviewer", thinkingLevel: "off" } }));
const errors: unknown[] = [];
const reports: any[] = [];
const replacements: any[] = [];
let runtime: any;
async function createRuntime(options: any) {
  const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager: sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }), resourceLoaderOptions: {
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fixture, join(extensionDir, "index.ts"), join(extensionDir, "../subagents/index.ts")],
  } });
  const result = await sdk.createAgentSessionFromServices({ services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent,
    model: services.modelRuntime.getModel("anthropic", "go-subagent-uat-parent"), thinkingLevel: "off" });
  assert.equal(result.extensionsResult.errors.length, 0, JSON.stringify(result.extensionsResult.errors));
  result.session.subscribe((event: any) => { if (event.type === "message_start" && event.message.customType === "subagent-result") reports.push(event.message); });
  return { ...result, services, diagnostics: services.diagnostics };
}
async function bind(session: any) {
  await session.bindExtensions({ mode: "sdk", onError: (error: unknown) => { errors.push(error); console.error(error); }, commandContextActions: {
    waitForIdle: () => session.agent.waitForIdle(),
    newSession: (options: any) => {
      const current = state();
      const handoff = readFileSync(runPath("HANDOFF.md"), "utf8");
      replacements.push({ kind: current.resetKind, handoff, reports: reports.length });
      if (current.resetKind === "context") {
        assert.ok(trace().some(row => row.event === "child_completed"), "Child finishes before session replacement");
        assert.equal(reports.length, 1, "Parent ingested automatic child report before replacement");
        assert.match(handoff, /SUBAGENT_EFFORT_PRESERVED_7a9f/, "HANDOFF includes child report before replacement");
        assert.match(readFileSync(runPath("JOURNAL.md"), "utf8"), /SUBAGENT_EFFORT_PRESERVED_7a9f/, "JOURNAL includes child evidence before replacement");
      }
      return runtime.newSession(options);
    },
    fork: (...args: any[]) => runtime.fork(...args), switchSession: (...args: any[]) => runtime.switchSession(...args), navigateTree: async () => ({ cancelled: true }), reload: async () => {},
  } });
}
async function until(check: () => boolean, description: string) {
  const deadline = Date.now() + 30_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}; cwd=${cwd}; trace=${JSON.stringify(trace().slice(-5))}`);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
try {
  runtime = await sdk.createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager: sdk.SessionManager.create(cwd, join(agentDir, "sessions")) });
  runtime.setRebindSession(bind);
  await bind(runtime.session);
  await runtime.session.prompt("/go Preserve live subagent work across context handoff.");
  await until(() => trace().some(row => row.event === "child_holding") && state().resetPending === true, "live child survives context threshold");
  assert.equal(replacements.filter(item => item.kind === "context").length, 0);
  assert.equal(state().status, "running");
  writeFileSync(join(cwd, "release-child"), "continue");
  await until(() => state().status === "done" || state().status === "paused" || state().status === "blocked", "report integrated, context reset, review completed");
  assert.equal(state().status, "done", JSON.stringify(state()));
  assert.equal(replacements.filter(item => item.kind === "context").length, 1);
  assert.equal(trace().filter(row => row.event === "child_aborted").length, 0);
  assert.equal(reports[0].details.status, "done");
  assert.match(readFileSync(join(cwd, "child-effort.txt"), "utf8"), /expensive work/);
  assert.ok(trace().some(row => row.event === "parent_integrates_result"));
  assert.equal(errors.length, 0);
  console.log(JSON.stringify({ result: "PASS", cwd, checks: ["real Pi child survives pending context reset", "child finishes without cancellation", "automatic report ingested exactly once", "parent incorporates report into HANDOFF before replacement", "fresh session completes independent review"] }, null, 2));
} finally {
  await runtime?.dispose();
  console.log(`Subagent UAT artifacts: ${cwd}`);
}
