import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { matchesKey } from "@earendil-works/pi-tui";
import { runReview } from "./reviewer.ts";
import { renderIndicator } from "./indicator.ts";
import {
	appendJournal, budgetReason, checkStall, CONTINUE_PROMPT, goPath, HANDOFF_PROMPT,
	lineCount, loadConfig, parseArgs, planningPrompt, readState, readText, saveState,
	seedPrompt, validateHandoff, promptForRun, type GoState,
} from "./core.ts";

const TOOL_NAMES = ["go_launch", "go_done", "go_blocked"];
// /go already owns context, durable run notes, final review and blocker escalation.
const CONTEXT_TOOLS = ["context_checkpoint", "context_timeline", "context_compact", "recall"];
const INTERACTIVE_TOOLS = ["request_feedback", "request_code_review", "ask_user_question"];
const active = (state?: GoState) => !!state && ["planning", "running", "reviewing"].includes(state.status);
const owned = (ctx: ExtensionContext, state?: GoState): state is GoState => !!state && state.sessionFile === ctx.sessionManager.getSessionFile();
const result = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });

export function excludeRunFiles(cwd: string): void {
	const git = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], { cwd, encoding: "utf8" });
	if (git.status !== 0) return; // A non-git project is supported too.
	const path = git.stdout.trim();
	const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
	if (root.status !== 0) throw new Error("Cannot determine git root for /go exclusion");
	const subdir = relative(root.stdout.trim(), cwd).split("\\").join("/");
	const pattern = `/${subdir ? `${subdir}/` : ""}.pi/go/`;
	const content = existsSync(path) ? readFileSync(path, "utf8") : "";
	if (!content.split(/\r?\n/).includes(pattern)) {
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, `${content && !content.endsWith("\n") ? "\n" : ""}${pattern}\n`);
	}
}

export default function goExtension(pi: ExtensionAPI) {
	// Runtime resource only: every run decision survives on disk, including pending resets.
	let budgetTimer: ReturnType<typeof setTimeout> | undefined;
	let removeInputListener: (() => void) | undefined;
	let hasOverlay = () => false;
	let uiPromptOpen = false;
	let sessionContext: ExtensionContext | undefined;
	const clearTimer = () => { if (budgetTimer) clearTimeout(budgetTimer); budgetTimer = undefined; };
	const show = (ctx: ExtensionContext, text: string, level: "info" | "warning" | "error" = "info") => {
		if (ctx.hasUI) ctx.ui.notify(text, level);
	};
	const syncIndicator = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		// A widget remains visible with custom footers; clear the old footer-only status.
		ctx.ui.setStatus("go", undefined);
		if (!owned(ctx, state)) { ctx.ui.setWidget("go", undefined); return; }
		const plan = readText(ctx.cwd, "PLAN.md", state.runId);
		ctx.ui.setWidget("go", (tui, theme) => {
			hasOverlay = () => tui.hasOverlay();
			return {
			render: (width: number) => [renderIndicator(state, plan, width, theme)],
			invalidate() {},
			};
		}, { placement: "aboveEditor" });
	};
	const syncTools = (ctx: ExtensionContext, state = readState(ctx.cwd, ctx.sessionManager.getSessionFile()), restoringSession = false) => {
		const enabled = owned(ctx, state) && active(state);
		const current = pi.getActiveTools().filter(name => !TOOL_NAMES.includes(name));
		if (enabled) {
			if (!state.toolsRestricted || !state.toolsBeforeGo) {
				state.toolsBeforeGo = current;
				state.toolsRestricted = true;
				saveState(ctx.cwd, state);
			}
			registerTools();
			const hidden = state.status === "planning" ? CONTEXT_TOOLS : [...CONTEXT_TOOLS, ...INTERACTIVE_TOOLS];
			const controls = state.status === "planning" ? ["go_launch", "go_blocked"] : state.status === "running" ? ["go_done", "go_blocked"] : [];
			pi.setActiveTools([...state.toolsBeforeGo.filter(name => !hidden.includes(name)), ...controls]);
		} else if (state?.toolsBeforeGo && (state.toolsRestricted || restoringSession)) {
			pi.setActiveTools(state.toolsBeforeGo);
			if (state.toolsRestricted) { state.toolsRestricted = false; saveState(ctx.cwd, state); }
		} else {
			pi.setActiveTools(current);
			// Preserve changes made with /tools while paused or after completion.
			if (state?.toolsBeforeGo && JSON.stringify(state.toolsBeforeGo) !== JSON.stringify(current)) {
				state.toolsBeforeGo = current; saveState(ctx.cwd, state);
			}
		}
		syncIndicator(ctx);
	};
	const terminal = async (ctx: ExtensionContext, state: GoState, status: "paused" | "blocked" | "done", reason: string) => {
		const current = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (!owned(ctx, current) || current.runId !== state.runId) return;
		if (current.status === status && current.reason === reason) return;
		if (current.status === "planning" || current.status === "running" || current.status === "reviewing") current.resumeStatus = current.status;
		current.status = status;
		current.reason = reason;
		current.reviewInFlight = false;
		current.resetQueued = false;
		saveState(ctx.cwd, current);
		clearTimer();
		syncTools(ctx, current);
		show(ctx, `/go ${status}: ${reason}`, status === "done" ? "info" : "warning");
		try {
			const response = await pi.exec("cmux", ["notify", "--title", "Pi /go", "--body", `[${ctx.cwd}] ${status}: ${reason}`], { timeout: 5_000 });
			if (response.code !== 0) show(ctx, `cmux notify failed: ${response.stderr || response.stdout}`, "warning");
		} catch (error) { show(ctx, `cmux notify unavailable: ${error}`, "warning"); }
	};
	const guard = <T>(handler: (...args: any[]) => Promise<T> | T) => async (...args: any[]) => {
		const ctx = args.at(-1) as ExtensionContext;
		try { return await handler(...args); }
		catch (error) {
			try { show(ctx, `/go: ${error}`, "error"); } catch { console.error(`/go: ${error}`); }
			try {
				const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
				if (owned(ctx, state) && active(state)) await terminal(ctx, state, "paused", String(error));
			} catch { /* Invalid state must never be overwritten. */ }
		}
	};
	const armTimer = (ctx: ExtensionContext, state: GoState) => {
		clearTimer();
		if (!state.budget?.minutes || !active(state)) return;
		const remaining = Date.parse(state.startedAt) + state.budget.minutes * 60_000 - Date.now();
		budgetTimer = setTimeout(() => {
			void guard(async (_event, currentCtx: ExtensionContext) => {
				const current = readState(currentCtx.cwd, currentCtx.sessionManager.getSessionFile());
				if (owned(currentCtx, current) && current.runId === state.runId && active(current)) {
					const reason = budgetReason(current);
					if (!reason) { armTimer(currentCtx, current); return; }
					const notification = terminal(currentCtx, current, "paused", reason);
					currentCtx.abort();
					await notification;
				}
			})(null, ctx);
		}, Math.max(1, Math.min(remaining, 2_147_483_647)));
		budgetTimer.unref?.();
	};
	const queueReset = (ctx: ExtensionContext, state: GoState) => {
		if (state.resetQueued) return;
		state.resetQueued = true;
		saveState(ctx.cwd, state);
		pi.sendUserMessage("/go-reset", { deliverAs: "followUp", expandPromptTemplates: true });
	};
	const subagents = () => {
		let snapshot = { active: 0, pendingResults: 0, resultVersion: 0 };
		pi.events.emit("subagents:handoff-query", { reply: (value: typeof snapshot) => { snapshot = value; } });
		return snapshot;
	};
	// A settled parent can still own working children or undelivered reports.
	const prepareHandoff = (ctx: ExtensionContext, state: GoState): boolean => {
		const children = subagents();
		state.waitingForSubagents = children.active + children.pendingResults;
		if (state.waitingForSubagents) {
			state.handoffRequested = false;
			state.handoffReady = false;
			state.resetQueued = false;
			const sendNotice = !state.waitingNoticeSent;
			state.waitingNoticeSent = true;
			saveState(ctx.cwd, state); syncIndicator(ctx);
			if (sendNotice) pi.sendUserMessage("A /go handoff is pending. Wait for existing subagents and incorporate their results. Use subagent_wait for visible subagent IDs; if none are visible, stop and let the extension wait for the background work. Do not start new work or new subagents. Keep their work intact; the fresh session will start only after their results are included in HANDOFF.md and JOURNAL.md.", { deliverAs: "steer" });
			return false;
		}
		if (!state.handoffRequested || state.handoffResultVersion !== children.resultVersion) {
			state.handoffRequested = true;
			state.handoffReady = false;
			state.handoffResultVersion = children.resultVersion;
			state.waitingNoticeSent = false;
			state.resetQueued = false;
			saveState(ctx.cwd, state); syncIndicator(ctx);
			pi.sendUserMessage(promptForRun(HANDOFF_PROMPT, state.runId), { deliverAs: "steer" });
			return false;
		}
		return state.handoffReady === true;
	};
	pi.events.on("subagents:handoff-changed", () => {
		if (!sessionContext) return;
		void guard(async (_event, ctx: ExtensionContext) => {
			if (!ctx.isIdle()) return;
			const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
			if (owned(ctx, state) && state.status === "running" && state.resetPending && prepareHandoff(ctx, state)) queueReset(ctx, state);
		})(null, sessionContext);
	});
	function registerTools() {
		pi.registerTool({
			name: "go_launch", label: "Launch /go", description: "Launch the planned autonomous run in a fresh session.",
			promptGuidelines: ["Call go_launch after writing PLAN.md and HANDOFF.md in this run's specified directory."],
			parameters: Type.Object({}), executionMode: "sequential",
			async execute(_id, _params, _signal, _update, ctx) {
				const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
				if (!owned(ctx, state) || state.status !== "planning") throw new Error("go_launch requires this session's planning run");
				validateHandoff(ctx.cwd, state.runId);
				state.status = "running";
				state.resetPending = true;
				state.resetKind = "launch";
				state.handoffRequested = true;
				state.handoffReady = true;
				state.handoffResultVersion = subagents().resultVersion;
				state.lastStopReason = undefined;
				saveState(ctx.cwd, state); syncTools(ctx, state);
				return result("Launch queued. Stop now; the fresh session will continue from PLAN and HANDOFF.");
			},
		});
		pi.registerTool({
			name: "go_done", label: "Review /go", description: "Request independent review after all PLAN done-criteria are verified.",
			promptGuidelines: ["Call go_done only when every PLAN done-criterion has evidence in JOURNAL.md."],
			parameters: Type.Object({}), executionMode: "sequential",
			async execute(_id, _params, _signal, _update, ctx) {
				const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
				if (!owned(ctx, state) || state.status !== "running") throw new Error("go_done requires this session's running run");
				if (state.resetPending) throw new Error("Finish the pending handoff first, then call go_done in the fresh session");
				const children = subagents();
				if (children.active || children.pendingResults) throw new Error("Wait for the existing subagents and incorporate their results before go_done.");
				state.status = "reviewing";
				state.reviewInFlight = false;
				saveState(ctx.cwd, state); syncTools(ctx, state);
				return result("Independent review will start when this turn settles. Stop now.");
			},
		});
		pi.registerTool({
			name: "go_blocked", label: "Block /go", description: "Stop the run for a genuine blocker or a required user decision.",
			promptGuidelines: ["Call go_blocked(reason) for genuine blockers, scope changes, or unapproved irreversible or external actions."],
			parameters: Type.Object({ reason: Type.String({ minLength: 1 }) }), executionMode: "sequential",
			async execute(_id, params, _signal, _update, ctx) {
				const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
				if (!owned(ctx, state) || !active(state)) throw new Error("No active /go run belongs to this session");
				appendJournal(ctx.cwd, `## Blocked · ${new Date().toISOString()}\n${params.reason}`, state.runId);
				await terminal(ctx, state, "blocked", params.reason);
				return result(`Run blocked: ${params.reason}. Stop work.`);
			},
		});
	}

	pi.registerCommand("go", {
		description: "Autonomous run: /go [--tokens 2M] [--minutes 90] [steering], or pause|resume|status|stop|reset",
		handler: guard(async (args: string, ctx) => {
			const [verb, ...rest] = args.trim().split(/\s+/);
			let state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
			if (verb === "reset") {
				if (rest.length) throw new Error("Usage: /go reset; then /go [steering] to start fresh.");
				if (!state) { show(ctx, "No /go run in this session. Start one with /go."); return; }
				const children = subagents();
				if (children.active || children.pendingResults) {
					show(ctx, "Wait for this session's subagents and their results before /go reset.", "warning"); return;
				}
				state.detached = true;
				state.status = "blocked";
				state.reason = "Archived by /go reset.";
				state.reviewInFlight = false;
				state.resetQueued = false;
				saveState(ctx.cwd, state);
				clearTimer(); syncTools(ctx, state);
				ctx.abort();
				await ctx.waitForIdle();
				show(ctx, `/go reset. Run files preserved in ${goPath(ctx.cwd, "", state.runId)}. Start fresh with /go.`);
				return;
			}
			if (verb === "status") {
				show(ctx, state ? `/go ${state.status} · ${state.tokensUsed} tokens · ${state.resets} resets · ${state.reviewRounds} reviews\nSession: ${state.sessionFile}${state.reason ? `\n${state.reason}` : ""}` : "No /go run in this session. Start one with /go.");
				return;
			}
			if (["pause", "resume", "stop"].includes(verb)) {
				if (!owned(ctx, state)) { show(ctx, "No /go run in this session. Start one with /go.", "warning"); return; }
				if (verb === "pause" || verb === "stop") {
					if (state.status === "done" || state.status === "blocked") { show(ctx, `/go already ${state.status}`); return; }
					const notification = terminal(ctx, state, verb === "pause" ? "paused" : "blocked", verb === "pause" ? "Paused by user. Use /go resume." : "Stopped by user.");
					ctx.abort();
					await notification;
					return;
				}
				if (state.status !== "paused" && state.status !== "blocked") { show(ctx, "Only paused or blocked runs can resume.", "warning"); return; }
				const options = parseArgs(rest.join(" "));
				if (options.steering) throw new Error("Usage: /go resume [--tokens TOTAL] [--minutes TOTAL]");
				if (options.budget) state.budget = { ...state.budget, ...options.budget };
				const reason = budgetReason(state);
				if (reason) { show(ctx, `${reason} Raise the total with /go resume --tokens 4M or --minutes 180.`, "warning"); return; }
				const wasBlocked = state.status === "blocked";
				const previousBlocker = state.reason;
				if (wasBlocked) {
					appendJournal(ctx.cwd, `## Resumed · ${new Date().toISOString()}\nUser requested /go resume. Previous blocker: ${previousBlocker ?? "unspecified"}. Continue with the latest clarification.`, state.runId);
					state.reviewRoundsAtResume = state.reviewRounds;
					state.reviewPassed = false;
					state.reviewAttemptId = undefined;
				}
				// A failed review needs worker repairs before another review attempt.
				state.status = wasBlocked ? (state.resumeStatus === "planning" ? "planning" : "running") : state.resumeStatus ?? "running";
				state.reason = undefined;
				state.lastStopReason = undefined;
				state.lastErrorMessage = undefined;
				state.reviewInFlight = false;
				state.resetQueued = false;
				saveState(ctx.cwd, state);
				syncTools(ctx, state); armTimer(ctx, state);
				if (state.resetPending) {
					state.handoffRequested = false;
					state.waitingNoticeSent = false;
					prepareHandoff(ctx, state);
				}
				else if (state.status === "reviewing") await review(ctx);
				else {
					const continuation = state.status === "planning" ? planningPrompt(state.steering) : CONTINUE_PROMPT;
					const clarification = wasBlocked ? `Resume this same run using the user's latest clarification in this conversation. Previous blocker: ${previousBlocker ?? "unspecified"}. Read .pi/go/JOURNAL.md for the latest blocker or review findings; preserve completed work. If still blocked, explain what remains via go_blocked.\n\n` : "";
					pi.sendUserMessage(promptForRun(clarification + continuation, state.runId), { deliverAs: "steer" });
				}
				return;
			}
			if (state && !["done", "blocked"].includes(state.status)) {
				show(ctx, `/go is ${state.status}; use /go resume, stop, or reset.`, "warning");
				return;
			}
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) throw new Error("/go requires a saved session (disable --no-session)");
			const config = loadConfig(ctx.cwd), options = parseArgs(args);
			excludeRunFiles(ctx.cwd);
			state = {
				runId: randomUUID(), status: "planning", steering: options.steering, sessionFile,
				startedAt: new Date().toISOString(), resets: 0,
				journalLinesAtLastReset: 0,
				reviewRounds: 0, budget: options.budget ?? config.budget, tokensUsed: 0, stallResets: 0,
			};
			saveState(ctx.cwd, state);
			syncTools(ctx, state); armTimer(ctx, state);
			pi.sendUserMessage(promptForRun(planningPrompt(state.steering), state.runId), { deliverAs: "followUp" });
		}),
	});

	pi.registerCommand("go-reset", {
		description: "Internal: replace the current /go segment with PLAN + HANDOFF",
		handler: guard(async (_args, ctx) => {
			const cwd = ctx.cwd;
			const state = readState(cwd, ctx.sessionManager.getSessionFile());
			if (!owned(ctx, state) || state.status !== "running" || !state.resetPending) return;
			if (!ctx.isIdle()) { state.resetQueued = false; saveState(cwd, state); return; }
			if (!prepareHandoff(ctx, state)) return;
			const reason = budgetReason(state);
			if (reason) { await terminal(ctx, state, "paused", reason); return; }
			const { plan, handoff } = validateHandoff(ctx.cwd, state.runId);
			const journal = readText(ctx.cwd, "JOURNAL.md", state.runId), lines = lineCount(journal);
			if (state.resetKind === "context" && checkStall(state, lines, loadConfig(ctx.cwd).maxStallResets)) {
				saveState(ctx.cwd, state);
				await terminal(ctx, state, "paused", "No journal progress across consecutive resets. Inspect the handoff, then /go resume.");
				return;
			}
			state.journalLinesAtLastReset = lines;
			const oldSession = state.sessionFile;
			const prompt = promptForRun(seedPrompt(plan, handoff, state.steering, journal.trimEnd().split("\n").slice(-20).join("\n")), state.runId);
			const replacement = await ctx.newSession({
				parentSession: oldSession,
				// setup runs before session_start; the replacement must own state before tools are armed.
				setup: async (sessionManager: SessionManager) => {
					const freshFile = sessionManager.getSessionFile();
					if (!freshFile) throw new Error("Replacement session has no persistent file");
					state.sessionFile = freshFile;
					state.resets += state.resetKind === "context" ? 1 : 0;
					state.resetPending = false;
					state.resetQueued = false;
					state.resetKind = undefined;
					state.handoffRequested = undefined;
					state.handoffReady = undefined;
					state.handoffResultVersion = undefined;
					state.waitingForSubagents = undefined;
					state.waitingNoticeSent = undefined;
					state.lastStopReason = undefined;
					saveState(cwd, state);
				},
				withSession: async (ctx2: { sendUserMessage(content: string): Promise<void> }) => { await ctx2.sendUserMessage(prompt); },
			});
			if (replacement.cancelled) {
				state.sessionFile = oldSession;
				saveState(ctx.cwd, state);
				await terminal(ctx, state, "paused", "Session replacement was cancelled. Use /go resume.");
			}
		}),
	});

	async function finishReview(ctx: ExtensionContext, state: GoState) {
		appendJournal(ctx.cwd, `## Done · ${new Date().toISOString()}\nIndependent review passed; PLAN done-criteria verified.`, state.runId);
		await terminal(ctx, state, "done", "Independent review passed. Ready to test.");
	}
	async function review(ctx: ExtensionContext) {
		const cwd = ctx.cwd, ownerFile = ctx.sessionManager.getSessionFile();
		const state = readState(cwd, ownerFile);
		if (!owned(ctx, state) || state.status !== "reviewing" || state.reviewInFlight) return;
		if (state.reviewPassed) { await finishReview(ctx, state); return; }
		const config = loadConfig(ctx.cwd);
		if (state.reviewRounds - (state.reviewRoundsAtResume ?? 0) >= config.maxReviewRounds) { await terminal(ctx, state, "blocked", "Independent review limit reached."); return; }
		state.reviewInFlight = true;
		state.reviewAttemptId = randomUUID();
		saveState(ctx.cwd, state); syncTools(ctx, state);
		let outcome: Awaited<ReturnType<typeof runReview>>;
		try { outcome = await runReview(ctx, config); }
		catch (error) {
			const current = readState(cwd, ownerFile);
			if (!current || current.sessionFile !== ownerFile || current.runId !== state.runId || current.reviewAttemptId !== state.reviewAttemptId || current.status !== "reviewing") return;
			current.reviewInFlight = false;
			saveState(ctx.cwd, current);
			await terminal(ctx, current, "paused", `Reviewer interrupted or failed: ${error}. Use /go resume.`);
			return;
		}
		const current = readState(cwd, ownerFile);
		if (!current || current.sessionFile !== ownerFile || current.runId !== state.runId || current.reviewAttemptId !== state.reviewAttemptId || current.status !== "reviewing" || !current.reviewInFlight) return;
		current.reviewInFlight = false;
		current.reviewRounds++;
		const round = current.reviewRounds - (current.reviewRoundsAtResume ?? 0);
		current.tokensUsed += outcome.tokens ?? 0;
		saveState(ctx.cwd, current);
		appendJournal(ctx.cwd, `## Review round ${current.reviewRounds} · ${new Date().toISOString()}\n${outcome.passed ? "<pass/>" : "<fail/>"}\n${outcome.warning ? `Warning: ${outcome.warning}\n` : ""}${outcome.findings}`, current.runId);
		if (outcome.warning) show(ctx, outcome.warning, "warning");
		if (outcome.passed) {
			current.reviewPassed = true;
			saveState(ctx.cwd, current);
			const reason = budgetReason(current);
			if (reason) { await terminal(ctx, current, "paused", `${reason} Review passed; raise the budget and /go resume to finish.`); return; }
			await finishReview(ctx, current);
		} else if (round >= config.maxReviewRounds) {
			await terminal(ctx, current, "blocked", `Review failed after ${round} rounds. See JOURNAL.md; after addressing the findings, use /go resume.`);
		} else {
			current.status = "running";
			saveState(ctx.cwd, current);
			const reason = budgetReason(current);
			if (reason) { await terminal(ctx, current, "paused", reason); return; }
			syncTools(ctx, current);
			pi.sendUserMessage(`Independent review failed (round ${round}/${config.maxReviewRounds}). Fix these findings, journal evidence, then call go_done again:\n${outcome.findings}`, { deliverAs: "followUp" });
		}
	}

	pi.on("session_start", guard(async (_event, ctx) => {
		sessionContext = ctx;
		uiPromptOpen = false;
		removeInputListener?.();
		if (ctx.mode === "tui") removeInputListener = ctx.ui.onTerminalInput((data: string) => {
			if (!matchesKey(data, "escape")) return;
			const current = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
			// Let Pi handle Esc in worker turns, autocomplete and dialogs. Only
			// independent review/child waiting needs an idle-session override.
			if (!owned(ctx, current) || !active(current) || !ctx.isIdle() ||
				(current.status !== "reviewing" && !current.waitingForSubagents) ||
				uiPromptOpen || hasOverlay() || ctx.ui.getEditorText()) return;
			void guard(async (_event, inputCtx: ExtensionContext) => {
				const notification = terminal(inputCtx, current, "paused", "Interrupted (Esc). Use /go resume.");
				inputCtx.abort();
				await notification;
			})(null, ctx);
			return { consume: true };
		});
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (owned(ctx, state) && active(state)) {
			// A process/reload cannot retain an in-flight request or queued command.
			state.reviewInFlight = false;
			state.resetQueued = false;
			saveState(ctx.cwd, state);
			armTimer(ctx, state);
		}
		syncTools(ctx, state, true);
	}));
	pi.on("session_shutdown", guard(async (_event, ctx) => {
		sessionContext = undefined;
		clearTimer(); removeInputListener?.(); removeInputListener = undefined;
		hasOverlay = () => false;
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (owned(ctx, state) && !active(state)) syncTools(ctx, state);
		if (owned(ctx, state) && state.status === "reviewing") await terminal(ctx, state, "paused", "Review interrupted by session shutdown. Open this session and /go resume.");
		if (ctx.hasUI) ctx.ui.setWidget("go", undefined);
	}));
	pi.on("ui_prompt_start", () => { uiPromptOpen = true; });
	pi.on("ui_prompt_end", () => { uiPromptOpen = false; });
	pi.on("input", guard(async (event, ctx) => {
		if (event.source === "extension") return;
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (!owned(ctx, state) || state.status !== "reviewing") return;
		state.reviewAttemptId = randomUUID();
		state.reviewInFlight = false;
		state.reviewPassed = false;
		state.status = "running";
		saveState(ctx.cwd, state);
		syncTools(ctx, state);
	}));
	pi.on("before_agent_start", guard(async (event, ctx) => {
		syncTools(ctx);
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (state && active(state)) return { systemPrompt: `${event.systemPrompt}\n\n${promptForRun("", state.runId)}` };
	}));
	pi.on("tool_execution_end", guard(async (_event, ctx) => { syncIndicator(ctx); }));
	pi.on("turn_end", guard(async (event, ctx) => {
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (!owned(ctx, state) || !active(state)) return;
		if (event.message.role === "assistant") {
			const message = event.message;
			const key = `${state.sessionFile}:${ctx.sessionManager.getLeafId() ?? `${message.timestamp}:${event.turnIndex}`}`;
			if (state.lastUsageEntry !== key) {
				const usage = message.usage;
				state.tokensUsed += usage ? (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0) : 0;
				state.lastUsageEntry = key;
			}
			state.lastStopReason = ctx.signal?.aborted ? "aborted" : message.stopReason;
			state.lastErrorMessage = message.stopReason === "error" ? message.errorMessage : undefined;
			if (state.handoffRequested && !["aborted", "error"].includes(state.lastStopReason ?? "")) state.handoffReady = true;
		}
		saveState(ctx.cwd, state);
		const reason = budgetReason(state);
		if (reason) { const notification = terminal(ctx, state, "paused", reason); ctx.abort(); await notification; return; }
		if (state.status === "running" && !state.resetPending && (ctx.getContextUsage()?.tokens ?? 0) > loadConfig(ctx.cwd).resetThresholdTokens) {
			state.resetPending = true;
			state.resetKind = "context";
			state.handoffRequested = false;
			saveState(ctx.cwd, state);
			prepareHandoff(ctx, state);
		}
		syncIndicator(ctx);
	}));
	pi.on("agent_settled", guard(async (_event, ctx) => {
		const state = readState(ctx.cwd, ctx.sessionManager.getSessionFile());
		if (!owned(ctx, state) || !active(state)) return;
		if (state.lastStopReason === "aborted") { await terminal(ctx, state, "paused", "Interrupted (Esc). Use /go resume."); return; }
		if (state.lastStopReason === "error") { await terminal(ctx, state, "paused", `Worker request failed: ${state.lastErrorMessage || "unknown provider error"}. Resolve it, then /go resume.`); return; }
		const reason = budgetReason(state);
		if (reason) { await terminal(ctx, state, "paused", reason); return; }
		if (state.resetPending) { if (prepareHandoff(ctx, state)) queueReset(ctx, state); return; }
		if (state.status === "reviewing") { await review(ctx); return; }
		if (state.status === "running") pi.sendUserMessage(promptForRun(CONTINUE_PROMPT, state.runId), { deliverAs: "followUp" });
	}));
}
