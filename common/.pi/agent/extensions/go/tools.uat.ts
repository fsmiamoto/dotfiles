// Real SDK /go tool-policy and 100k reminder regression. No paid model calls.
// Run: node common/.pi/agent/extensions/go/tools.uat.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { goPath, readState } from "./core.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const sdk = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const artifacts = mkdtempSync(join(tmpdir(), "pi-go-tools-uat-"));
mkdirSync(join(artifacts, "bin"));
writeFileSync(join(artifacts, "bin/cmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
process.env.PATH = `${join(artifacts, "bin")}:${process.env.PATH ?? ""}`;
const memoryTools = ["context_checkpoint", "context_timeline", "context_compact", "recall"];
const interactiveTools = ["request_feedback", "request_code_review", "ask_user_question"];
const goTools = ["go_launch", "go_done", "go_blocked"];
const preserved = ["read", "bash", "write", "edit", "web_search", "background_job", "subagent_spawn", "custom_work"];
const evidence: object[] = [];

for (const reminderFirst of [true, false]) {
  const cwd = join(artifacts, reminderFirst ? "reminder-first" : "go-first");
  const agentDir = join(cwd, "agent");
  mkdirSync(agentDir, { recursive: true }); mkdirSync(goPath(cwd, ""), { recursive: true });
  writeFileSync(goPath(cwd, "config.json"), JSON.stringify({ resetThresholdTokens: 250_000, reviewer: { provider: "anthropic", model: "go-tools-reviewer", thinkingLevel: "off" } }));
  const errors: unknown[] = [], notices: string[] = [];
  const trace = () => existsSync(join(cwd, "tools-trace.jsonl")) ? readFileSync(join(cwd, "tools-trace.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  let runtime: any;
  const state = () => readState(cwd, runtime.session.sessionManager.getSessionFile());
  async function until(check: () => boolean, description: string) {
    const deadline = Date.now() + 20_000;
    while (!check()) {
      assert.equal(errors.length, 0, JSON.stringify(errors));
      assert.ok(Date.now() < deadline, `Timed out: ${description}; cwd=${cwd}; trace=${JSON.stringify(trace().slice(-3))}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  async function open(sessionManager: any) {
    async function create(options: any) {
      const go = join(extensionDir, "index.ts"), reminder = join(extensionDir, "../handoff-reminder.ts");
      const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager: sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }), resourceLoaderOptions: {
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        additionalExtensionPaths: [join(extensionDir, "fixtures/tools-uat-provider.ts"), ...(reminderFirst ? [reminder, go] : [go, reminder])],
      } });
      const result = await sdk.createAgentSessionFromServices({ services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent, model: services.modelRuntime.getModel("anthropic", "go-tools-worker"), thinkingLevel: "off" });
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
    runtime.setRebindSession(bind); await bind(runtime.session);
  }
  const requests = (status?: string) => trace().filter(row => row.event === "request" && row.model === "go-tools-worker" && row.status === status);
  function checkTools(names: string[], status?: string) {
    const active = ["planning", "running", "reviewing"].includes(status ?? "");
    const interactive = !["running", "reviewing"].includes(status ?? "");
    for (const name of preserved) assert.ok(names.includes(name), `${status}: lost work tool ${name}`);
    for (const name of memoryTools) assert.equal(names.includes(name), !active, `${status}: memory tool ${name}`);
    for (const name of interactiveTools) assert.equal(names.includes(name), interactive, `${status}: interactive tool ${name}`);
    assert.ok(!names.includes("custom_disabled"), `${status}: originally disabled tool enabled`);
    assert.deepEqual(names.filter(name => goTools.includes(name)).sort(), status === "planning" ? ["go_blocked", "go_launch"] : status === "running" ? ["go_blocked", "go_done"] : []);
  }
  function noReminder() {
    assert.ok(!notices.some(message => message.includes("Context crossed")), "Native reminder fired inside attached /go");
    assert.ok(!trace().some(row => row.reminder), "Native reminder reached the model inside attached /go");
  }
  async function pause() { await runtime.session.prompt("/go pause"); await runtime.session.agent.waitForIdle(); checkTools(runtime.session.getActiveToolNames(), "paused"); }
  try {
    await open(sdk.SessionManager.create(cwd, join(agentDir, "sessions")));
    runtime.session.setActiveToolsByName(runtime.session.getActiveToolNames().filter((name: string) => name !== "custom_disabled"));
    await runtime.session.prompt("/go Verify tool policy through all phases");
    await until(() => trace().some(row => row.event === "high-usage" && row.status === "planning"), "planning crosses 100k");
    await runtime.session.agent.waitForIdle();
    assert.ok(requests("planning").length); for (const row of requests("planning")) checkTools(row.tools, "planning"); noReminder();
    await pause();
    writeFileSync(join(cwd, "normal-high"), "100k");
    await runtime.session.prompt("Verify ordinary work while paused");
    checkTools(requests("paused").at(-1).tools, "paused"); noReminder();
    const originalSession = runtime.session.sessionManager.getSessionFile();
    await runtime.dispose(); await open(sdk.SessionManager.open(originalSession));
    checkTools(runtime.session.getActiveToolNames(), "paused");
    await runtime.session.prompt("Verify paused reload still owns handoff"); noReminder();
    writeFileSync(join(cwd, "action"), "launch");
    await runtime.session.prompt("/go resume");
    await until(() => state()?.status === "running" && state()?.sessionFile !== originalSession && trace().some(row => row.event === "holding" && row.status === "running"), "launch transfers restricted tool baseline to fresh SDK session");
    for (const row of requests("running")) checkTools(row.tools, "running"); noReminder();
    await pause();
    writeFileSync(join(cwd, "action"), "done");
    await runtime.session.prompt("/go resume");
    await until(() => state()?.status === "done", "independent review passes");
    await runtime.session.agent.waitForIdle();
    assert.ok(requests("reviewing").length, "Worker sees updated reviewing tools after go_done");
    for (const row of requests("reviewing")) checkTools(row.tools, "reviewing");
    const reviewRequests = trace().filter(row => row.model === "go-tools-reviewer");
    assert.ok(reviewRequests.length); for (const row of reviewRequests) assert.deepEqual([...row.tools].sort(), ["find", "grep", "ls", "read"]);
    checkTools(runtime.session.getActiveToolNames(), "done");
    await runtime.session.prompt("Verify completed run still owns handoff"); noReminder();
    await runtime.session.prompt("/go reset");
    checkTools(runtime.session.getActiveToolNames());
    await runtime.session.prompt("Verify native 100k warning after reset");
    await until(() => notices.some(message => message.includes("Context crossed")), "reset returns native handoff warning");
    assert.ok(trace().some(row => row.reminder), "Native reminder reaches model again after reset");
    // A separate blocked run verifies terminal restoration as well as pause/done/reset.
    writeFileSync(join(cwd, "action"), "blocked");
    await runtime.session.prompt("/go Verify blocked tool restoration");
    await until(() => state()?.status === "blocked", "go_blocked restores tools");
    await runtime.session.agent.waitForIdle(); checkTools(runtime.session.getActiveToolNames(), "blocked");
    const requestsBeforeResetRun = requests("planning").length;
    await runtime.session.prompt("/go Verify reset restores actively restricted tools");
    await until(() => requests("planning").length > requestsBeforeResetRun, "replacement planning run starts");
    await runtime.session.agent.waitForIdle(); checkTools(runtime.session.getActiveToolNames(), "planning");
    await runtime.session.prompt("/go reset"); checkTools(runtime.session.getActiveToolNames());
    assert.equal(errors.length, 0, JSON.stringify(errors));
    evidence.push({ order: reminderFirst ? "reminder before go" : "go before reminder", result: "PASS", requests: trace().filter(row => row.event === "request").length });
  } finally { if (runtime) { await runtime.session.abort(); await runtime.dispose(); } }
}
const result = { result: "PASS", artifacts, checks: ["actual model tools per planning/running/reviewing phase", "work and unknown custom tools retained", "pause/done/blocked/reset restore baseline", "disabled tools stay disabled across reload and fresh launch session", "independent reviewer remains read-only", "100001 tokens suppressed in planning/running/paused/completed and after reload", "reset restores native reminder", "both real extension load orders"], evidence };
writeFileSync(join(artifacts, "acceptance.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
