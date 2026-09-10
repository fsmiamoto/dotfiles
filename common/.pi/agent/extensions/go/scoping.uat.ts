// Run: node common/.pi/agent/extensions/go/scoping.uat.ts
// Real SDK sessions and extension lifecycle; isolated offline provider, no paid calls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { goPath, readState, type GoState } from "./core.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const sdk = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const cwd = mkdtempSync(join(tmpdir(), "pi-go-scoping-uat-"));
const agentDir = join(cwd, "agent");
// Keep acceptance-test notifications out of the user's live terminal.
mkdirSync(join(cwd, "bin"));
writeFileSync(join(cwd, "bin/cmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
process.env.PATH = `${join(cwd, "bin")}:${process.env.PATH ?? ""}`;
mkdirSync(agentDir); mkdirSync(goPath(cwd, ""), { recursive: true });
writeFileSync(goPath(cwd, "config.json"), JSON.stringify({ resetThresholdTokens: 20_000 }));
const errors: unknown[] = [];
const notices: string[] = [];
const runtimes = new Set<any>();
const trace = () => existsSync(join(cwd, "scoping-trace.jsonl")) ? readFileSync(join(cwd, "scoping-trace.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const stateFor = (runtime: any) => readState(cwd, runtime.session.sessionManager.getSessionFile());
const rawState = (runId: string) => readFileSync(goPath(cwd, "state.json", runId), "utf8");
async function until(check: () => boolean, description: string) {
  const deadline = Date.now() + 20_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}; cwd=${cwd}; trace=${JSON.stringify(trace().slice(-4))}`);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
async function open(sessionManager: any) {
  let runtime: any;
  async function create(options: any) {
    const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager: sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }), resourceLoaderOptions: {
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalExtensionPaths: [join(extensionDir, "fixtures/scoping-uat-provider.ts"), join(extensionDir, "index.ts")],
    } });
    const result = await sdk.createAgentSessionFromServices({ services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent, model: services.modelRuntime.getModel("anthropic", "go-scoping-uat"), thinkingLevel: "off" });
    assert.equal(result.extensionsResult.errors.length, 0, JSON.stringify(result.extensionsResult.errors));
    return { ...result, services, diagnostics: services.diagnostics };
  }
  async function bind(session: any) {
    await session.bindExtensions({ mode: "sdk", onError: (error: unknown) => errors.push(error),
      uiContext: { notify: (message: string) => notices.push(message), setWidget: () => {}, setStatus: () => {}, onTerminalInput: () => () => {}, getEditorText: () => "" },
      commandContextActions: { waitForIdle: () => session.agent.waitForIdle(), newSession: (options: any) => runtime.newSession(options), fork: (...args: any[]) => runtime.fork(...args), switchSession: (...args: any[]) => runtime.switchSession(...args), navigateTree: async () => ({ cancelled: true }), reload: async () => {} },
    });
  }
  runtime = await sdk.createAgentSessionRuntime(create, { cwd, agentDir, sessionManager });
  runtime.setRebindSession(bind); await bind(runtime.session); runtimes.add(runtime);
  return runtime;
}
const managerA = sdk.SessionManager.create(cwd, join(agentDir, "sessions"));
const managerB = sdk.SessionManager.create(cwd, join(agentDir, "sessions"));
const originalA = managerA.getSessionFile();
const originalB = managerB.getSessionFile();
const legacy: GoState = { runId: "legacy-paused-owner-a", status: "paused", steering: "Legacy landing page", sessionFile: originalA, startedAt: "2026-09-10T00:00:00.000Z", resets: 0, journalLinesAtLastReset: 0, reviewRounds: 0, tokensUsed: 100, stallResets: 0, resumeStatus: "running" };
writeFileSync(goPath(cwd, "state.json"), JSON.stringify(legacy));
for (const file of ["PLAN.md", "HANDOFF.md", "JOURNAL.md"]) writeFileSync(goPath(cwd, file), `Legacy ${file}; preserve this effort.\n`);
const legacyBytes = readFileSync(goPath(cwd, "state.json"), "utf8");
try {
  // Exact reported trigger: a new same-cwd session starts /go beside a foreign paused legacy state.
  let b = await open(managerB);
  assert.equal(stateFor(b), undefined);
  await b.session.prompt("/go Session B independent task");
  await until(() => trace().some(row => row.event === "holding" && row.sessionFile === originalB), "B creates scoped documents and streams despite foreign paused run");
  const firstB = stateFor(b)!;
  assert.equal(firstB.status, "planning"); assert.notEqual(firstB.runId, legacy.runId);
  assert.equal(readFileSync(goPath(cwd, "state.json"), "utf8"), legacyBytes, "Foreign legacy state untouched");
  assert.ok(!existsSync(goPath(cwd, "state.json", legacy.runId)), "B does not migrate A");
  const a = await open(managerA);
  assert.equal(stateFor(a)?.runId, legacy.runId); assert.equal(stateFor(a)?.status, "paused");
  for (const file of ["PLAN.md", "HANDOFF.md", "JOURNAL.md"]) assert.equal(readFileSync(goPath(cwd, file, legacy.runId), "utf8"), readFileSync(goPath(cwd, file), "utf8"), "Owner migration preserves legacy docs");
  await a.session.prompt("/go resume");
  await until(() => trace().some(row => row.event === "holding" && row.runId === legacy.runId), "A resumes independently while B plans");
  const ownerBefore = rawState(legacy.runId);
  const oldPlan = readFileSync(goPath(cwd, "PLAN.md", firstB.runId), "utf8");
  await b.session.prompt("/go reset");
  await b.session.agent.waitForIdle();
  assert.equal(stateFor(b), undefined, "Reset detaches only current run");
  assert.equal(JSON.parse(rawState(firstB.runId)).detached, true);
  assert.equal(readFileSync(goPath(cwd, "PLAN.md", firstB.runId), "utf8"), oldPlan, "Reset preserves archived effort");
  assert.equal(rawState(legacy.runId), ownerBefore, "Reset cannot mutate another live session");
  assert.ok(!b.session.getActiveToolNames().includes("go_done"));
  await b.session.prompt("/go Session B fresh replacement task");
  await until(() => trace().some(row => row.event === "holding" && row.runId !== firstB.runId && row.sessionFile === originalB), "B starts fresh after reset");
  const newB = stateFor(b)!;
  assert.notEqual(newB.runId, firstB.runId);
  assert.match(readFileSync(goPath(cwd, "PLAN.md", newB.runId), "utf8"), /fresh replacement/);
  assert.ok(!readFileSync(goPath(cwd, "PLAN.md", newB.runId), "utf8").includes(firstB.runId));
  await b.session.prompt("/go pause"); await b.session.agent.waitForIdle();
  await b.dispose(); runtimes.delete(b);
  b = await open(sdk.SessionManager.open(originalB));
  assert.equal(stateFor(b)?.runId, newB.runId, "Reload chooses current scoped run");
  assert.equal(stateFor(b)?.status, "paused");
  writeFileSync(join(cwd, `launch-${newB.runId}`), "launch");
  await b.session.prompt("/go resume");
  await until(() => stateFor(b)?.runId === newB.runId && stateFor(b)?.sessionFile !== originalB && trace().some(row => row.event === "holding" && row.runId === newB.runId && row.status === "running"), "Launch transfers same run to replacement session");
  assert.equal(readState(cwd, originalB), undefined, "Reopening predecessor cannot resurrect handed-off run");
  await b.session.prompt("/go pause"); await b.session.agent.waitForIdle();
  const launchOwner = stateFor(b)!.sessionFile;
  writeFileSync(join(cwd, `context-${newB.runId}`), "context threshold");
  await b.session.prompt("/go resume");
  await until(() => stateFor(b)?.resets === 1 && stateFor(b)?.sessionFile !== launchOwner, "Context handoff preserves run directory and transfers owner");
  assert.equal(stateFor(b)?.runId, newB.runId);
  assert.equal(readState(cwd, launchOwner), undefined);
  assert.match(readFileSync(goPath(cwd, "HANDOFF.md", newB.runId), "utf8"), /SCOPED_CONTEXT_HANDOFF/);
  assert.equal(rawState(legacy.runId), ownerBefore, "Other session stays unchanged through reload and both handoffs");
  assert.ok(trace().filter(row => row.event === "request" && row.runId === newB.runId).every(row => row.system.includes(`.pi/go/runs/${newB.runId}/`)), "Every model turn receives the authoritative scoped directory");
  // A migrated legacy owner can reset without stale root state resurrecting on reload.
  await a.session.prompt("/go reset"); await a.session.agent.waitForIdle();
  assert.equal(readState(cwd, originalA), undefined);
  assert.equal(readFileSync(goPath(cwd, "state.json"), "utf8"), legacyBytes);
  await a.dispose(); runtimes.delete(a);
  const reopenedA = await open(sdk.SessionManager.open(originalA));
  assert.equal(stateFor(reopenedA), undefined, "Archived legacy run stays detached after restart");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const evidence = { result: "PASS", cwd, checks: ["reported foreign paused legacy start regression", "two live same-cwd sessions own isolated runs and documents", "owner-only lossless legacy migration", "reset aborts current work and archives its files", "reset leaves other session unchanged", "fresh run after reset", "session reload restores scoped paused run", "launch and context handoffs preserve run directory", "predecessor sessions cannot resurrect transferred runs", "system prompts always identify current scoped directory", "legacy reset cannot resurrect on restart"] };
  writeFileSync(join(cwd, "acceptance.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} finally {
  for (const runtime of runtimes) { await runtime.session.abort(); await runtime.dispose(); }
  console.log(`Scoping UAT artifacts: ${cwd}`);
}
