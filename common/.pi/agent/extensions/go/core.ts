import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type Status = "planning" | "running" | "reviewing" | "paused" | "blocked" | "done";
export interface Budget { tokens?: number; minutes?: number }
export interface GoConfig {
	resetThresholdTokens: number;
	maxReviewRounds: number;
	maxStallResets: number;
	reviewer: { provider: string; model?: string; thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" };
	budget: Budget | null;
}
export interface GoState {
	runId: string;
	status: Status;
	steering: string;
	sessionFile: string;
	startedAt: string;
	resets: number;
	journalLinesAtLastReset: number;
	reviewRounds: number;
	/** Completed review count when the user last resumed a blocked run. */
	reviewRoundsAtResume?: number;
	budget?: Budget | null;
	tokensUsed: number;
	stallResets: number;
	resetPending?: boolean;
	resetQueued?: boolean;
	resetKind?: "launch" | "context";
	handoffRequested?: boolean;
	handoffReady?: boolean;
	handoffResultVersion?: number;
	waitingForSubagents?: number;
	waitingNoticeSent?: boolean;
	lastStopReason?: string;
	lastErrorMessage?: string;
	reason?: string;
	resumeStatus?: "planning" | "running" | "reviewing";
	lastUsageEntry?: string;
	reviewInFlight?: boolean;
	reviewAttemptId?: string;
	reviewPassed?: boolean;
	detached?: boolean;
	toolsBeforeGo?: string[];
	toolsRestricted?: boolean;
}
export const DEFAULT_CONFIG: GoConfig = {
	resetThresholdTokens: 100_000, maxReviewRounds: 2, maxStallResets: 2,
	reviewer: { provider: "anthropic", thinkingLevel: "high" }, budget: null,
};
function safeRunId(runId: string): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId)) throw new Error("Invalid /go run ID.");
	return runId;
}
export const goPath = (cwd: string, file: string, runId?: string): string => runId === undefined
	? join(cwd, ".pi", "go", file)
	: join(cwd, ".pi", "go", "runs", safeRunId(runId), file);
export function readText(cwd: string, file: string, runId?: string): string {
	try { return readFileSync(goPath(cwd, file, runId), "utf8"); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
function readJSON(path: string): any {
	try { return JSON.parse(readFileSync(path, "utf8")); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw new Error(`Cannot read ${path}: ${error}`); }
}
function ownedState(path: string, sessionFile: string): GoState | undefined {
	let state: GoState | undefined;
	// An unreadable other session's state cannot prevent this session from running.
	try { state = readJSON(path); } catch { return; }
	if (!state || state.sessionFile !== sessionFile) return;
	if (!["planning", "running", "reviewing", "paused", "blocked", "done"].includes(state.status) || typeof state.runId !== "string") {
		throw new Error(`Invalid ${path}; inspect it before starting /go.`);
	}
	safeRunId(state.runId);
	return state;
}
const sessionPointer = (cwd: string, sessionFile: string) => goPath(cwd, `sessions/${createHash("sha256").update(sessionFile).digest("hex")}.json`);
function writeJSON(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const temp = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	renameSync(temp, path);
}
export function readState(cwd: string, sessionFile: string | undefined): GoState | undefined {
	if (!sessionFile) return;
	const pointerPath = sessionPointer(cwd, sessionFile);
	const pointer = readJSON(pointerPath);
	if (pointer !== undefined) {
		if (typeof pointer?.runId !== "string") throw new Error(`Invalid ${pointerPath}; expected a run ID.`);
		const path = goPath(cwd, "state.json", pointer.runId);
		// Ownership is known here: corruption must be visible, never select an older run.
		const current = readJSON(path);
		if (!current || current.runId !== pointer.runId || typeof current.sessionFile !== "string" ||
			!["planning", "running", "reviewing", "paused", "blocked", "done"].includes(current.status)) {
			throw new Error(`Invalid ${path}; inspect this run's state.`);
		}
		return current.sessionFile === sessionFile && !current.detached ? current : undefined;
	}
	const states: GoState[] = [];
	const runsPath = goPath(cwd, "runs");
	let runs: string[] = [];
	try { runs = readdirSync(runsPath); }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
	for (const runId of runs) {
		if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId)) continue;
		const state = ownedState(goPath(cwd, "state.json", runId), sessionFile);
		if (state && state.runId === runId) states.push(state);
	}
	const legacy = ownedState(goPath(cwd, "state.json"), sessionFile);
	// The scoped state is authoritative even after ownership changes or a reset.
	if (legacy && !existsSync(goPath(cwd, "state.json", legacy.runId))) {
		mkdirSync(goPath(cwd, "", legacy.runId), { recursive: true });
		for (const file of ["PLAN.md", "HANDOFF.md", "JOURNAL.md"]) {
			try { copyFileSync(goPath(cwd, file), goPath(cwd, file, legacy.runId)); }
			catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		}
		saveState(cwd, legacy);
		states.push(legacy);
	}
	const newest = states.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
	if (newest) writeJSON(pointerPath, { runId: newest.runId });
	return newest?.detached ? undefined : newest;
}
export function saveState(cwd: string, state: GoState): void {
	writeJSON(goPath(cwd, "state.json", state.runId), state);
	writeJSON(sessionPointer(cwd, state.sessionFile), { runId: state.runId });
}
function positive(value: unknown, name: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
	return value;
}
function validateBudget(value: unknown): Budget | null {
	if (value == null) return null;
	if (typeof value !== "object" || Array.isArray(value)) throw new Error("budget must be an object or null");
	const budget = value as Budget;
	if (budget.tokens !== undefined) positive(budget.tokens, "budget.tokens");
	if (budget.minutes !== undefined) positive(budget.minutes, "budget.minutes");
	return { ...budget };
}
export function mergeConfig(global: any = {}, project: any = {}): GoConfig {
	for (const input of [global, project]) if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("go config must be a JSON object");
	const config: GoConfig = { ...DEFAULT_CONFIG, ...global, ...project, reviewer: { ...DEFAULT_CONFIG.reviewer, ...global.reviewer, ...project.reviewer } };
	positive(config.resetThresholdTokens, "resetThresholdTokens");
	for (const name of ["maxReviewRounds", "maxStallResets"] as const) {
		positive(config[name], name);
		if (!Number.isInteger(config[name])) throw new Error(`${name} must be an integer`);
	}
	if (config.reviewer.provider !== "anthropic") throw new Error("reviewer.provider must be anthropic");
	if (config.reviewer.model !== undefined && (typeof config.reviewer.model !== "string" || !config.reviewer.model.trim())) throw new Error("reviewer.model must be a non-empty model ID");
	if (!["off", "minimal", "low", "medium", "high", "xhigh"].includes(config.reviewer.thinkingLevel)) throw new Error("Invalid reviewer.thinkingLevel");
	config.budget = validateBudget(config.budget);
	return config;
}
export function loadConfig(cwd: string, globalPath = join(homedir(), ".pi", "agent", "go.json")): GoConfig {
	return mergeConfig(readJSON(globalPath), readJSON(goPath(cwd, "config.json")));
}
export function parseArgs(args: string): { steering: string; budget?: Budget } {
	const budget: Budget = {};
	const steering = args.replace(/(?:^|\s)--(tokens|minutes)(?:=|\s+)(\S+)/g, (_match, kind, value) => {
		if (budget[kind as keyof Budget] !== undefined) throw new Error(`Duplicate --${kind}`);
		const match = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(value);
		if (!match || (kind === "minutes" && match[2])) throw new Error(`Invalid --${kind}: ${value}`);
		budget[kind as keyof Budget] = positive(Number(match[1]) * ({ k: 1_000, m: 1_000_000 }[match[2].toLowerCase()] ?? 1), kind);
		return " ";
	}).trim();
	if (/(?:^|\s)--(?:tokens|minutes)(?:\s|=|$)/.test(steering)) throw new Error("Usage: /go [--tokens 2M] [--minutes 90] [steering]");
	return { steering, ...(Object.keys(budget).length ? { budget } : {}) };
}
export function budgetReason(state: GoState, now = Date.now()): string | undefined {
	if (state.budget?.tokens && state.tokensUsed >= state.budget.tokens) return `Token budget reached (${state.tokensUsed}/${state.budget.tokens}).`;
	if (state.budget?.minutes && now - Date.parse(state.startedAt) >= state.budget.minutes * 60_000) return `Time budget reached (${state.budget.minutes} minutes).`;
}
export const lineCount = (text: string): number => (text.match(/\n/g) ?? []).length;
export function checkStall(state: GoState, journalLines: number, maxStallResets: number): boolean {
	state.stallResets = journalLines <= state.journalLinesAtLastReset ? state.stallResets + 1 : 0;
	state.journalLinesAtLastReset = journalLines;
	return state.stallResets >= maxStallResets;
}
export function appendJournal(cwd: string, text: string, runId?: string): void {
	mkdirSync(goPath(cwd, "", runId), { recursive: true });
	appendFileSync(goPath(cwd, "JOURNAL.md", runId), `\n${text}\n`);
}
export const AUTONOMY = "Decide routine implementation details yourself, bounded by PLAN. Call go_blocked for scope changes, destructive or irreversible actions, external side effects not authorized in PLAN, or genuine blockers. Steering can loosen design freedom, never safety or scope. Before starting the next thing, append a timestamped JOURNAL.md entry for every completed task, decision, failed approach, and test run, including evidence. Never rewrite JOURNAL.md. Keep PLAN tasks checked and HANDOFF.md current (at most 60 lines; current task, tree state, verification, next 1–3 actions, gotchas).";
export const CONTINUE_PROMPT = `Continue the /go run. Check .pi/go/PLAN.md; when all done-criteria hold, call go_done. Journal before moving on. ${AUTONOMY}`;
export const HANDOFF_PROMPT = "Context limit reached. Update .pi/go/HANDOFF.md and append .pi/go/JOURNAL.md now, then stop without starting new work. Do not call go_done until after the fresh-session handoff.";
export function planningPrompt(steering: string): string {
	return `From this conversation write .pi/go/PLAN.md (scope, non-goals, done-criteria each verifiable by command or inspection, ordered task checklist) and .pi/go/HANDOFF.md (starting state, at most 60 lines). Preserve existing JOURNAL.md and append the new run's starting entry. Steering: ${steering || "none"}. ${AUTONOMY} Then call go_launch.`;
}
export function seedPrompt(plan: string, handoff: string, steering: string, journalTail: string): string {
	return `Continue this autonomous /go run in the same project. Steering: ${steering || "none"}\n\n${AUTONOMY}\n\nPLAN (.pi/go/PLAN.md):\n${plan}\n\nHANDOFF (.pi/go/HANDOFF.md):\n${handoff}\n\nLast 20 journal lines (older entries stay on disk):\n${journalTail}\n\nContinue with the current task. When every done-criterion is verified, call go_done; call go_blocked(reason) if blocked.`;
}
export function validateHandoff(cwd: string, runId?: string): { plan: string; handoff: string } {
	const plan = readText(cwd, "PLAN.md", runId), handoff = readText(cwd, "HANDOFF.md", runId);
	if (!plan.trim() || !handoff.trim()) throw new Error(`Write non-empty ${runId ? `.pi/go/runs/${safeRunId(runId)}` : ".pi/go"}/PLAN.md and HANDOFF.md before go_launch/reset.`);
	if (handoff.trimEnd().split("\n").length > 60) throw new Error("HANDOFF.md exceeds 60 lines; shorten it before continuing.");
	return { plan, handoff };
}

export function promptForRun(text: string, runId: string): string {
	const directory = `.pi/go/runs/${safeRunId(runId)}/`;
	return `The authoritative directory for this /go run is ${directory}. Read and update PLAN.md, HANDOFF.md, and JOURNAL.md only in this directory. Earlier conversation paths may refer to other runs or the legacy .pi/go/ directory; use this run's directory instead.\n\n${text.replace(/\.pi\/go\/(?=(?:PLAN\.md|HANDOFF\.md|JOURNAL\.md|state\.json)\b)/g, directory)}`;
}
