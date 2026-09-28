// Real SDK regression: /go handoffs carry the latest session model + thinking level, session-only.
// Run: node common/.pi/agent/extensions/go/model.uat.ts
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
const cwd = mkdtempSync(join(tmpdir(), "pi-go-model-uat-"));
const agentDir = join(cwd, "agent");
mkdirSync(join(cwd, "bin"));
writeFileSync(join(cwd, "bin/cmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
process.env.PATH = `${join(cwd, "bin")}:${process.env.PATH ?? ""}`;
delete process.env.GO_MODEL_UAT_NO_ALT;
mkdirSync(agentDir, { recursive: true }); mkdirSync(goPath(cwd, ""), { recursive: true });
execFileSync("git", ["init", "--quiet", cwd]);
writeFileSync(goPath(cwd, "config.json"), JSON.stringify({ resetThresholdTokens: 20_000, reviewer: { model: "go-model-reviewer", thinkingLevel: "off" } }));
// Real settings file: the global default the bug used to revert to. Must stay byte-identical.
const settingsPath = join(agentDir, "settings.json");
const settingsBefore = JSON.stringify({ defaultProvider: "anthropic", defaultModel: "go-model-default", defaultThinkingLevel: "low", compaction: { enabled: false }, retry: { enabled: false } }, null, 2);
writeFileSync(settingsPath, settingsBefore);

const errors: unknown[] = [], notices: [string, string?][] = [];
const trace = () => existsSync(join(cwd, "model-trace.jsonl")) ? readFileSync(join(cwd, "model-trace.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const workerRequests = (session: string) => trace().filter(row => row.event === "request" && row.sessionFile === session && row.model !== "go-model-reviewer");
let runtime: any, lastState: GoState | undefined;
const state = () => {
  const owned = readState(cwd, runtime.session.sessionManager.getSessionFile());
  if (owned) lastState = owned;
  else if (lastState) lastState = JSON.parse(readFileSync(goPath(cwd, "state.json", lastState.runId), "utf8"));
  return lastState!;
};
const session = () => runtime.session.sessionManager.getSessionFile() as string;
async function until(check: () => boolean, description: string) {
  const deadline = Date.now() + 30_000;
  while (!check()) {
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.ok(Date.now() < deadline, `Timed out: ${description}; cwd=${cwd}; trace=${JSON.stringify(trace().slice(-4))}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
async function create(options: any) {
  // No explicit model: Pi picks the settings default for every fresh session (the reverted-model bug).
  const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager: sdk.SettingsManager.create(cwd, agentDir), resourceLoaderOptions: {
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [join(extensionDir, "fixtures/model-uat-provider.ts"), join(extensionDir, "index.ts")],
  } });
  const result = await sdk.createAgentSessionFromServices({ services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent });
  assert.equal(result.extensionsResult.errors.length, 0, JSON.stringify(result.extensionsResult.errors));
  return { ...result, services, diagnostics: services.diagnostics };
}
async function bind(s: any) {
  await s.bindExtensions({ mode: "sdk", onError: (error: unknown) => errors.push(error),
    uiContext: { notify: (message: string, level?: string) => notices.push([message, level]), setWidget: () => {}, setStatus: () => {}, onTerminalInput: () => () => {}, getEditorText: () => "" },
    commandContextActions: { waitForIdle: () => s.agent.waitForIdle(), newSession: (o: any) => runtime.newSession(o), fork: (...a: any[]) => runtime.fork(...a), switchSession: (...a: any[]) => runtime.switchSession(...a), navigateTree: async () => ({ cancelled: true }), reload: async () => {} },
  });
}
try {
  runtime = await sdk.createAgentSessionRuntime(create, { cwd, agentDir, sessionManager: sdk.SessionManager.create(cwd, join(agentDir, "sessions")) });
  runtime.setRebindSession(bind); await bind(runtime.session);
  assert.equal(runtime.session.model.id, "go-model-default", "Starts on the settings default model");
  assert.equal(runtime.session.thinkingLevel, "low", "Starts on the settings default thinking");
  const s1 = session();
  await runtime.session.prompt("/go Verify model carry across handoffs");
  await until(() => existsSync(goPath(cwd, "PLAN.md", state().runId)) && runtime.session.isIdle, "planning writes PLAN");
  assert.ok(workerRequests(s1).every(row => row.model === "go-model-default" && row.reasoning === "low"), "Planning uses default model + thinking X");
  // User switches model + thinking mid-run (session-only, like /model without persistence).
  assert.equal(await runtime.session.setModel(runtime.session.modelRuntime.getModel("anthropic", "go-model-alt")), undefined);
  runtime.session.setThinkingLevel("high");
  writeFileSync(join(cwd, "uat-hold"), "hold");
  // Not awaited: the launch command's withSession awaits the held session-2 turn.
  const launch = runtime.session.prompt("UAT launch now");
  // Launch handoff → session 2.
  await until(() => session() !== s1 && trace().some(row => row.event === "holding" && row.sessionFile === session()), "launch replacement starts working");
  const s2 = session();
  const first2 = workerRequests(s2)[0];
  assert.equal(first2.model, "go-model-alt", "Launch replacement's first request uses the carried alt model");
  assert.equal(first2.reasoning, "high", "Launch replacement's first request uses carried thinking Y");
  assert.deepEqual(state().model, { provider: "anthropic", id: "go-model-alt" });
  assert.equal(state().thinkingLevel, "high");
  // Latest choice wins: switch thinking again inside session 2, then let a context reset happen.
  runtime.session.setThinkingLevel("medium");
  writeFileSync(join(cwd, "uat-release"), "go");
  await until(() => state().status === "done" || state().status === "blocked", "context reset then review completes run 1");
  await launch;
  assert.equal(state().status, "done", JSON.stringify(state()));
  assert.equal(state().resets, 1, "One context reset after launch");
  const s3 = state().sessionFile;
  assert.notEqual(s3, s2);
  const requests3 = workerRequests(s3);
  assert.ok(requests3.length && requests3.every(row => row.model === "go-model-alt" && row.reasoning === "medium"), `Context replacement uses latest alt + medium: ${JSON.stringify(requests3)}`);
  assert.equal(state().thinkingLevel, "medium");
  assert.ok(!notices.some(([text]) => /carried model/.test(text)), "No fallback warning when the model is available");
  await runtime.session.prompt("/go status");
  assert.match(notices.at(-1)![0], /Model: anthropic\/go-model-alt · thinking medium/, "/go status shows carried model + thinking");

  // Fallback: carried model is unavailable in the next session → default model, warning, run continues.
  process.env.GO_MODEL_UAT_NO_ALT = "1";
  const run1 = state().runId;
  await runtime.session.prompt("/go Verify unavailable carried model falls back");
  await until(() => state().runId !== run1 && existsSync(goPath(cwd, "PLAN.md", state().runId)) && runtime.session.isIdle, "fallback run planned");
  await runtime.session.prompt("UAT launch now");
  await until(() => state().runId !== run1 && (state().status === "done" || state().status === "blocked"), "fallback run completes");
  assert.equal(state().status, "done", JSON.stringify(state()));
  const s4 = state().sessionFile;
  const requests4 = workerRequests(s4);
  assert.ok(requests4.length && requests4.every(row => row.model === "go-model-default" && row.reasoning === "medium"), `Fallback uses default model, thinking still carried: ${JSON.stringify(requests4)}`);
  assert.ok(notices.some(([text, level]) => level === "warning" && /carried model anthropic\/go-model-alt unavailable; continuing on anthropic\/go-model-default/.test(text)), `Visible fallback warning: ${JSON.stringify(notices)}`);

  assert.equal(readFileSync(settingsPath, "utf8"), settingsBefore, "Global settings.json unchanged (no defaultModel/defaultThinkingLevel written)");
  assert.ok(!existsSync(join(cwd, ".pi/settings.json")), "No project settings written");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const result = { result: "PASS", cwd, sessions: [s1, s2, s3, s4].length, checks: ["fresh sessions default to settings model + thinking X", "launch handoff carries mid-run alt model + thinking Y", "context handoff carries latest thinking change", "/go status shows carried model + thinking", "unavailable carried model → default + warning, run completes", "settings.json byte-identical"] };
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (runtime) { await runtime.session.abort(); await runtime.dispose(); }
  delete process.env.GO_MODEL_UAT_NO_ALT;
  console.log(`Model UAT artifacts: ${cwd}`);
}
