// Run: node common/.pi/agent/extensions/go/uat.ts
// Real Pi SDK/session runtime/tools; deterministic offline provider, no credentials/network.
import assert from "node:assert/strict";
import { goPath, readState, type GoState } from "./core.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const sdkPath = join(packageDir, "dist/index.js");
const sdk = await import(pathToFileURL(sdkPath).href);
const cwd = mkdtempSync(join(tmpdir(), "pi-go-uat-"));
const agentDir = join(cwd, "agent");
// Keep acceptance-test notifications out of the user's live terminal.
mkdirSync(join(cwd, "bin"));
writeFileSync(join(cwd, "bin/cmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
process.env.PATH = `${join(cwd, "bin")}:${process.env.PATH ?? ""}`;
mkdirSync(join(cwd, ".pi", "go"), { recursive: true });
mkdirSync(agentDir);
execFileSync("git", ["init", "--quiet", cwd]);
writeFileSync(join(cwd, ".pi/go/config.json"), JSON.stringify({ resetThresholdTokens: 20_000, reviewer: { model: "go-uat-reviewer", thinkingLevel: "off" } }));
let lastState: GoState | undefined;
const state = () => {
  const owned = readState(cwd, runtime?.session.sessionManager.getSessionFile());
  if (owned) lastState = owned;
  else if (lastState) lastState = JSON.parse(readFileSync(goPath(cwd, "state.json", lastState.runId), "utf8"));
  return lastState!;
};
const runPath = (file: string) => goPath(cwd, file, state().runId);
const trace = () => existsSync(join(cwd, "uat-trace.jsonl")) ? readFileSync(join(cwd, "uat-trace.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const errors: unknown[] = [];
const instances: object[] = [];
const settings = sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
let runtime: any;
async function createRuntime(options: any) {
	const services = await sdk.createAgentSessionServices({
		cwd, agentDir, settingsManager: settings,
		resourceLoaderOptions: {
			noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			additionalExtensionPaths: [join(extensionDir, "fixtures/uat-provider.ts"), join(extensionDir, "index.ts")],
		},
	});
	const result = await sdk.createAgentSessionFromServices({ services, sessionManager: options.sessionManager,
		sessionStartEvent: options.sessionStartEvent, model: services.modelRuntime.getModel("anthropic", "go-uat-worker"), thinkingLevel: "off" });
	assert.equal(result.extensionsResult.errors.length, 0, JSON.stringify(result.extensionsResult.errors));
	instances.push(result.extensionsResult.extensions.find((e: any) => e.path.endsWith("go/index.ts")));
	return { ...result, services, diagnostics: services.diagnostics };
}
async function bind(session: any) {
	await session.bindExtensions({
		mode: "sdk", onError: (error: unknown) => { errors.push(error); console.error("Extension error:", error); },
		commandContextActions: {
			waitForIdle: () => session.agent.waitForIdle(),
			newSession: (options: any) => runtime.newSession(options),
			fork: (...args: any[]) => runtime.fork(...args), switchSession: (...args: any[]) => runtime.switchSession(...args),
			navigateTree: async () => ({ cancelled: true }), reload: async () => {},
		},
	});
}
async function until(check: () => boolean, description: string) {
	const deadline = Date.now() + 30_000;
	while (!check()) {
		assert.ok(Date.now() < deadline, `Timed out: ${description}. cwd=${cwd}, state=${JSON.stringify(state())}`);
		assert.equal(errors.length, 0, JSON.stringify(errors));
		await new Promise(resolve => setTimeout(resolve, 20));
	}
}
try {
	runtime = await sdk.createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager: sdk.SessionManager.create(cwd, join(agentDir, "sessions")) });
	runtime.setRebindSession(bind);
	await bind(runtime.session);
	assert.equal(runtime.session.getContextUsage().tokens, 0, "Fresh context usage");
	assert.ok(!runtime.session.getActiveToolNames().includes("go_done"), "No active run hides tools");
	// Hold the fresh running session, then abort through the same SDK operation as Esc.
	writeFileSync(join(cwd, "uat-hold"), "running");
	await runtime.session.prompt("/go Create the three trivial task files described in UAT PLAN.");
	await until(() => trace().some(row => row.event === "holding"), "running response streaming");
	await runtime.session.abort();
	await until(() => state().status === "paused", "Esc-equivalent abort pauses run");
	assert.equal(runtime.session.messages.filter((m: any) => m.role === "assistant").at(-1).stopReason, "aborted");
	const initialJournal = readFileSync(runPath("JOURNAL.md"), "utf8");
	unlinkSync(join(cwd, "uat-hold"));
	const resumedSession = runtime.session;
	const busyTurns = () => trace().filter(row => row.event === "request" && row.text === "UAT native work keeps calling tools").length;
	const nativeWork = resumedSession.prompt("UAT native work keeps calling tools");
	await until(() => busyTurns() >= 3, "native task keeps calling tools while goal is paused");
	assert.equal(state().status, "paused");
	const turnsBeforeResume = busyTurns();
	await runtime.session.prompt("/go resume");
	await until(() => state().status === "done" || state().status === "blocked", "three tasks, two context resets, independent reviewer");
	await nativeWork;
	assert.ok(busyTurns() <= turnsBeforeResume + 1, "Resume steers at the next tool boundary instead of starving as a follow-up");
	assert.equal(resumedSession.getFollowUpMessages().length, 0, "Resume leaves no orphaned follow-up in the replaced session");
	assert.equal(state().status, "done", JSON.stringify(state()));
	assert.equal(readFileSync(join(cwd, "batch-after-launch.txt"), "utf8"), "Tool batch finished before session replacement.\n", "Launch waits for complete tool batch");
	assert.ok(state().resets >= 2, "At least two context resets");
	assert.ok(instances.length >= 3 && new Set(instances).size === instances.length, "New extension instance per replacement");
	assert.equal(errors.length, 0, JSON.stringify(errors));
	const journal = readFileSync(runPath("JOURNAL.md"), "utf8");
	assert.ok(journal.startsWith(initialJournal), "Original journal prefix survives all resets");
	assert.match(journal, /UAT start/);
	for (const n of [1, 2, 3]) {
		assert.equal(readFileSync(join(cwd, `task-${n}.txt`), "utf8"), `task ${n}\n`);
		assert.match(journal, new RegExp(`Task ${n}:`));
	}
	const requests = trace().filter(row => row.event === "request");
	const starts = trace().filter(row => row.event === "session_start");
	assert.equal(state().sessionFile, starts.at(-1).session, "State owns latest replacement session");
	for (let n = 1; n < starts.length; n++) {
		const header = JSON.parse(readFileSync(starts[n].session, "utf8").split("\n")[0]);
		assert.equal(header.parentSession, starts[n - 1].session, "Replacement preserves parent session linkage");
	}
	assert.ok(requests.some(row => row.text.includes("UAT handoff marker 1")), "HANDOFF reloaded after reset 1");
	assert.ok(requests.some(row => row.text.includes("UAT handoff marker 2")), "HANDOFF reloaded after reset 2");
	assert.ok(requests.every(row => row.text !== "/go-reset"), "Internal reset dispatched as command, never model input");
	const review = requests.find(row => row.model === "go-uat-reviewer");
	assert.ok(review, "Different reviewer model used");
	assert.deepEqual([...review.tools].sort(), ["find", "grep", "ls", "read"], "Reviewer gets only read-only tools");
	assert.match(readFileSync(join(cwd, ".git/info/exclude"), "utf8"), /\.pi\/go/);
	assert.ok(!runtime.session.getActiveToolNames().includes("go_done"), "Terminal state hides tools");
	const contextResets = state().resets;
	// Exercise actual review retry transitions using new runs in the same tiny repo.
	writeFileSync(join(cwd, "uat-review-fail-count"), "1");
	await runtime.session.prompt("/go Verify reviewer findings are fixed and reviewed again.");
	await until(() => state().status === "done" || state().status === "blocked", "review failure followed by fix and pass");
	assert.equal(state().status, "done", JSON.stringify(state()));
	assert.equal(state().reviewRounds, 2);
	assert.equal(readFileSync(join(cwd, "reviewer-proof.txt"), "utf8"), "reviewed\n");
	assert.match(readFileSync(runPath("JOURNAL.md"), "utf8"), /UAT review fix/);
	writeFileSync(join(cwd, "uat-review-fail-count"), "2");
	await runtime.session.prompt("/go Verify two failed review rounds stop the loop.");
	await until(() => state().status === "done" || state().status === "blocked", "two review failures block the run");
	assert.equal(state().status, "blocked", JSON.stringify(state()));
	assert.equal(state().reviewRounds, 2);
	assert.ok(!runtime.session.getActiveToolNames().includes("go_done"));
	// A clarification is ordinary conversation; explicit resume reopens the same run.
	async function resumeBlocked(clarification: string, expectedReviews: number) {
		await until(() => runtime.session.isIdle, "blocked worker and native continuation settle before clarification");
		const blocked = structuredClone(state());
		const oldJournal = readFileSync(runPath("JOURNAL.md"), "utf8");
		const oldPlan = readFileSync(runPath("PLAN.md"), "utf8");
		const oldHandoff = readFileSync(runPath("HANDOFF.md"), "utf8");
		await runtime.session.prompt(clarification);
		assert.equal(state().status, "blocked", "Plain clarification cannot silently resume a blocked run");
		const beforeResume = structuredClone(state());
		const requestCount = trace().filter(row => row.event === "request").length;
		await runtime.session.prompt("/go resume");
		await until(() => state().status === "done" || state().status === "blocked", "blocked run resumes and completes");
		assert.equal(state().status, "done", JSON.stringify(state()));
		const resumed = trace().filter(row => row.event === "request").slice(requestCount).find(row => row.model === "go-uat-worker");
		assert.ok(resumed, "Resume starts the worker to address the blocker before review");
		assert.equal(resumed.state.status, "running");
		for (const key of ["runId", "sessionFile", "startedAt", "tokensUsed", "resets", "reviewRounds"] as const) {
			assert.equal(resumed.state[key], beforeResume[key], `Resume preserves ${key}`);
		}
		assert.ok(resumed.tools.includes("go_done") && resumed.tools.includes("go_blocked"), "Worker controls restored on resume");
		assert.ok(resumed.userTexts.some((text: string) => text.includes(clarification)), "Worker context retains the user's clarification");
		assert.ok(resumed.text.includes(blocked.reason!), "Resume prompt explains the previous blocker");
		assert.ok(resumed.text.includes(`.pi/go/runs/${blocked.runId}/JOURNAL.md`), "Resume reads the same scoped journal");
		assert.equal(state().runId, blocked.runId);
		assert.equal(state().sessionFile, blocked.sessionFile);
		assert.equal(state().startedAt, blocked.startedAt);
		assert.equal(state().resets, blocked.resets);
		assert.equal(state().reviewRounds, expectedReviews, "Review audit count remains cumulative after resuming");
		assert.equal(readFileSync(runPath("PLAN.md"), "utf8"), oldPlan);
		assert.equal(readFileSync(runPath("HANDOFF.md"), "utf8"), oldHandoff);
		assert.ok(readFileSync(runPath("JOURNAL.md"), "utf8").startsWith(oldJournal), "Resume preserves all prior journal evidence");
		assert.ok(!runtime.session.getActiveToolNames().includes("go_done"), "Completed resumed run hides controls again");
	}
	await resumeBlocked("UAT clarification: the review findings are resolved; verify the existing artifacts.", 3);
	// Exercise a genuine worker blocker, independently of the review-limit path.
	writeFileSync(join(cwd, "uat-block-once"), "Need the user to confirm the existing task artifacts are in scope.");
	await runtime.session.prompt("/go Verify a worker blocker can continue after clarification.");
	await until(() => state().status === "blocked", "worker go_blocked stops the run");
	assert.match(state().reason!, /confirm the existing task artifacts/);
	assert.equal(state().reviewRounds, 0);
	await resumeBlocked("UAT clarification: the existing three task artifacts are in scope; continue.", 1);
	// Pause an actual independent reviewer request and resume a new attempt.
	writeFileSync(join(cwd, "uat-review-hold"), "hold");
	await runtime.session.prompt("/go Verify paused independent reviews cancel and resume.");
	await until(() => trace().some(row => row.event === "holding" && row.model === "go-uat-reviewer"), "independent reviewer streaming");
	await runtime.session.prompt("/go pause");
	assert.equal(state().status, "paused");
	assert.equal(state().reviewRounds, 0, "Interrupted review does not spend a round");
	await until(() => trace().some(row => row.event === "aborted" && row.model === "go-uat-reviewer"), "reviewer request cancelled");
	unlinkSync(join(cwd, "uat-review-hold"));
	await runtime.session.prompt("/go resume");
	await until(() => state().status === "done" || state().status === "blocked", "reviewer resume completes");
	assert.equal(state().status, "done", JSON.stringify(state()));
	assert.equal(state().reviewRounds, 1);
	// Reset while the separate reviewer is streaming, then immediately replace the run.
	const reviewHoldsBeforeReset = trace().filter(row => row.event === "holding" && row.model === "go-uat-reviewer").length;
	const reviewAbortsBeforeReset = trace().filter(row => row.event === "aborted" && row.model === "go-uat-reviewer").length;
	writeFileSync(join(cwd, "uat-review-hold"), "hold");
	await runtime.session.prompt("/go Verify reset cancels a held reviewer without contaminating the next run.");
	await until(() => trace().filter(row => row.event === "holding" && row.model === "go-uat-reviewer").length > reviewHoldsBeforeReset, "reviewer holds before reset");
	const resetReview = state();
	const preservedPlan = readFileSync(runPath("PLAN.md"), "utf8");
	await runtime.session.prompt("/go reset");
	assert.equal(readState(cwd, runtime.session.sessionManager.getSessionFile()), undefined, "Reset detaches reviewing goal");
	assert.equal(JSON.parse(readFileSync(goPath(cwd, "state.json", resetReview.runId), "utf8")).detached, true);
	unlinkSync(join(cwd, "uat-review-hold"));
	await runtime.session.prompt("/go Fresh goal after resetting a streaming reviewer.");
	await until(() => state().runId !== resetReview.runId && (state().status === "done" || state().status === "blocked"), "new goal completes after reviewer reset");
	assert.equal(state().status, "done", JSON.stringify(state()));
	assert.equal(state().reviewRounds, 1, "Only the new run's review is counted");
	await until(() => trace().filter(row => row.event === "aborted" && row.model === "go-uat-reviewer").length > reviewAbortsBeforeReset, "Reset cancels the previous reviewer stream");
	assert.equal(state().status, "done", "Late reviewer cancellation leaves new run done");
	const archivedReview = JSON.parse(readFileSync(goPath(cwd, "state.json", resetReview.runId), "utf8"));
	assert.equal(archivedReview.detached, true);
	assert.equal(archivedReview.reviewRounds, 0, "Cancelled reviewer cannot update archived state");
	assert.equal(readFileSync(goPath(cwd, "PLAN.md", resetReview.runId), "utf8"), preservedPlan);
	assert.equal(errors.length, 0, JSON.stringify(errors));
	console.log(JSON.stringify({ result: "PASS", cwd, resets: contextResets, instances: instances.length, checks: ["running abort pause/resume", "resume during native tool loop without follow-up starvation", "planning + launch after complete tool batch", "fresh extension instances + parent linkage", "2+ resets", "journal continuity", "handoff reload", "internal command routing", "different read-only reviewer pass", "review fail/fix/pass", "two review failures block", "blocked clarification then resume preserves identity, files, tools and cumulative reviews", "worker go_blocked then same-run resume", "review cancellation pause/resume", "reset held reviewer then fresh run without stale review contamination", "terminal tool removal", "git exclusion"], providerFixture: join(extensionDir, "fixtures/uat-provider.ts") }, null, 2));
} finally {
	await runtime?.dispose();
	console.log(`UAT artifacts: ${cwd}`);
}
