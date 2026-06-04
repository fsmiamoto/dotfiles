/**
 * /goal orchestrator — deterministic Planner → Builder → Verifier → Review → Ready
 * state machine. Each node entry creates a FRESH AgentSession.
 *
 * See ~/.dotfiles/spec.html (or the in-repo spec) for the full design.
 */

import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	defineTool,
	getAgentDir,
	ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionEvent,
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import { loadAllRoles, type RoleDefinition, type RoleName } from "./nodes.ts";
import { createRunLogger, type RunLogger } from "./log.ts";
import { GOAL_MSG_TYPE, type GoalStreamDetails } from "./renderer.ts";


async function makeLoader(opts: any): Promise<any> {
	const loader: any = new DefaultResourceLoader(opts);
	if (typeof loader.reload === "function") await loader.reload();
	return loader;
}

// ── Types ────────────────────────────────────────────────────────────

type NodeState = "planner" | "builder" | "verifier" | "reviewer";
type RunPhase = NodeState | "ready" | "idle";

interface RecordedVerdict {
	status: string;
	reason: string;
	source: "tool" | "classifier" | "skip";
}

interface RunState {
	goal: string;
	conversationTail: string;
	roles: Record<RoleName, RoleDefinition>;
	logger: RunLogger;
	startedAt: number;
	loops: number; // Builder entry count
	phase: RunPhase;
	lastVerdict?: { node: NodeState; status: string; reason: string };
	plan: string; // Planner output, used as canonical handoff
	scratchpads: Record<RoleName, string[]>;
	currentSession?: AgentSession;
	currentRole?: RoleName;
	recordedVerdict?: RecordedVerdict;
	pendingSteer?: string;
	paused: boolean;
	resumePending: boolean;
	resumeKind?: "retry" | "skip" | "quit";
	resumeResolve?: () => void;
	spinnerFrame: number;
	timer?: ReturnType<typeof setInterval>;
	customMessageRendererRegistered: boolean;
	/** Set by quit() to signal runLoop to bail at next checkpoint. */
	quitting: boolean;
}

// ── UI helpers ───────────────────────────────────────────────────────

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const STATUS_KEY = "goal-status";
const WIDGET_KEY = "goal-status-widget";

const NODE_LABELS: Record<NodeState, string> = {
	planner: "PLANNER",
	builder: "BUILDER",
	verifier: "VERIFIER",
	reviewer: "REVIEW",
};

const BREADCRUMB_ORDER: { phase: NodeState | "ready"; label: string }[] = [
	{ phase: "planner", label: "Plan" },
	{ phase: "builder", label: "Build" },
	{ phase: "verifier", label: "Verify" },
	{ phase: "reviewer", label: "Review" },
	{ phase: "ready", label: "Ready" },
];

function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	if (m === 0) return `${s}s`;
	return `${m}m${String(s).padStart(2, "0")}s`;
}

function truncate(text: string, max = 200): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

// ── Custom message types & content shape ─────────────────────────────
// (imported at top: GOAL_MSG_TYPE, GoalStreamDetails)

// ── Orchestrator class ───────────────────────────────────────────────

export class GoalOrchestrator {
	private state: RunState | undefined;
	private readonly pi: ExtensionAPI;
	private readonly ctx: () => ExtensionContext | undefined;

	constructor(pi: ExtensionAPI, getCtx: () => ExtensionContext | undefined) {
		this.pi = pi;
		this.ctx = getCtx;
	}

	isRunning(): boolean {
		return !!this.state;
	}

	/** Route plain-typed text into the active sub-session. */
	async steerActive(text: string): Promise<boolean> {
		if (!this.state) return false;
		const s = this.state;
		s.logger.log("action", { action: "steer", text });
		if (s.paused) {
			// Stored, injected into next retry's seed.
			s.pendingSteer = s.pendingSteer ? `${s.pendingSteer}\n${text}` : text;
			this.emitInfo(`Pending steer queued for retry: ${truncate(text, 120)}`);
			this.renderStatus();
			return true;
		}
		if (s.currentSession) {
			try {
				await s.currentSession.steer(text);
				this.emitInfo(`Steer → ${s.currentRole ?? "?"}: ${truncate(text, 120)}`);
			} catch (err) {
				this.emitInfo(`Steer failed: ${(err as Error).message}`);
			}
		}
		return true;
	}

	async pause(): Promise<void> {
		if (!this.state) return;
		const s = this.state;
		if (s.paused) {
			this.emitInfo("Already paused.");
			return;
		}
		s.logger.log("action", { action: "pause" });
		s.paused = true;
		if (s.currentSession) {
			try {
				await s.currentSession.abort();
			} catch {
				// ignore
			}
		}
		this.renderStatus();
		this.emitInfo("Paused. Use /goal retry, /goal skip, or /goal quit.");
	}

	async retry(): Promise<void> {
		if (!this.state) return;
		const s = this.state;
		if (!s.paused) {
			this.emitInfo("/goal retry only works while paused. Use /goal pause first.");
			return;
		}
		s.logger.log("action", { action: "retry" });
		this.signalResume("retry");
	}

	async skip(): Promise<void> {
		if (!this.state) return;
		const s = this.state;
		if (!s.paused) {
			this.emitInfo("/goal skip only works while paused. Use /goal pause first.");
			return;
		}
		s.logger.log("action", { action: "skip" });
		this.signalResume("skip");
	}

	async quit(): Promise<void> {
		if (!this.state) return;
		const s = this.state;
		s.logger.log("action", { action: "quit" });
		s.quitting = true;
		// If we were paused, signal the loop to exit.
		if (s.paused) {
			this.signalResume("quit");
			return;
		}
		// Otherwise, abort the active node and let runLoop tear down.
		if (s.currentSession) {
			try {
				await s.currentSession.abort();
			} catch {
				// ignore
			}
		}
	}

	private signalResume(kind: "retry" | "skip" | "quit"): void {
		if (!this.state) return;
		const s = this.state;
		s.resumeKind = kind;
		if (s.resumeResolve) {
			const r = s.resumeResolve;
			s.resumeResolve = undefined;
			r();
		} else {
			s.resumePending = true;
		}
	}

	/** Start a fresh /goal run. */
	async start(goal: string, conversationTail: string): Promise<void> {
		if (this.state) {
			this.emitInfo("A /goal run is already active. Use /goal quit first.");
			return;
		}
		let roles: Record<RoleName, RoleDefinition>;
		try {
			roles = loadAllRoles();
		} catch (err) {
			this.pi.sendMessage({
				customType: GOAL_MSG_TYPE,
				content: `/goal startup failed: ${(err as Error).message}`,
				display: true,
				details: { kind: "info" } satisfies GoalStreamDetails,
			});
			return;
		}

		const logger = createRunLogger();
		this.state = {
			goal,
			conversationTail,
			roles,
			logger,
			startedAt: Date.now(),
			loops: 0,
			phase: "planner",
			plan: "",
			scratchpads: { planner: [], builder: [], verifier: [], reviewer: [] },
			paused: false,
			resumePending: false,
			spinnerFrame: 0,
			customMessageRendererRegistered: false,
			quitting: false,
		};
		this.ensureRenderer();
		logger.log("run_start", { goal });
		this.emitInfo(`/goal started. Log: ${logger.logPath}`);
		this.startTimer();
		this.renderStatus();

		try {
			await this.runLoop();
		} catch (err) {
			this.emitInfo(`/goal crashed: ${(err as Error).message}`);
			await this.endRun("quit");
		}
	}

	// ── State machine loop ──────────────────────────────────────────

	private async runLoop(): Promise<void> {
		const s = this.state!;
		// Planner runs once.
		s.phase = "planner";
		this.renderStatus();
		const plannerOutcome = await this.runNode("planner");
		if (plannerOutcome === "quit") {
			await this.endRun("quit");
			return;
		}
		// Use the planner's final assistant text as the canonical plan.
		s.plan = plannerOutcome.finalText.trim() || "(planner produced no plan)";
		s.logger.log("edge", { from: "planner", to: "builder" });

		// Builder loop.
		while (true) {
			s.phase = "builder";
			s.loops += 1;
			this.renderStatus();
			const builderOutcome = await this.runNode("builder");
			if (builderOutcome === "quit") {
				await this.endRun("quit");
				return;
			}
			const v = builderOutcome.verdict;
			s.lastVerdict = { node: "builder", status: v.status, reason: v.reason };
			s.logger.log("verdict", { node: "builder", source: v.source, status: v.status, reason: v.reason });
			if (v.status === "not_done") {
				s.logger.log("edge", { from: "builder", to: "builder" });
				continue;
			}
			if (v.status !== "done") {
				// Unknown verdict — pause for human.
				this.emitInfo(`Builder verdict could not be classified (${v.status}). Pausing.`);
				const action = await this.awaitResume();
				if (action === "quit") {
					await this.endRun("quit");
					return;
				}
				if (action === "retry") continue;
				if (action === "skip") {
					// fall through to Verifier
				}
			}
			s.logger.log("edge", { from: "builder", to: "verifier" });

			// Verifier.
			s.phase = "verifier";
			this.renderStatus();
			const verifierOutcome = await this.runNode("verifier");
			if (verifierOutcome === "quit") {
				await this.endRun("quit");
				return;
			}
			const vv = verifierOutcome.verdict;
			s.lastVerdict = { node: "verifier", status: vv.status, reason: vv.reason };
			s.logger.log("verdict", { node: "verifier", source: vv.source, status: vv.status, reason: vv.reason });
			if (vv.status === "reject") {
				s.logger.log("edge", { from: "verifier", to: "builder" });
				continue;
			}
			if (vv.status !== "accept") {
				this.emitInfo(`Verifier verdict could not be classified (${vv.status}). Pausing.`);
				const action = await this.awaitResume();
				if (action === "quit") {
					await this.endRun("quit");
					return;
				}
				if (action === "retry") {
					s.logger.log("edge", { from: "verifier", to: "verifier" });
					// re-run verifier (treat retry as same node fresh)
					s.phase = "verifier";
					// Loop back: easiest is to call runNode again here, but
					// the outer while restarts from Builder. We handle this
					// by recursing once.
					const reRun = await this.runNode("verifier");
					if (reRun === "quit") {
						await this.endRun("quit");
						return;
					}
					const rv = reRun.verdict;
					s.lastVerdict = { node: "verifier", status: rv.status, reason: rv.reason };
					s.logger.log("verdict", { node: "verifier", source: rv.source, status: rv.status, reason: rv.reason });
					if (rv.status !== "accept") {
						if (rv.status === "reject") {
							s.logger.log("edge", { from: "verifier", to: "builder" });
							continue;
						}
					}
				}
				// skip falls through
			}
			s.logger.log("edge", { from: "verifier", to: "reviewer" });

			// Reviewer.
			s.phase = "reviewer";
			this.renderStatus();
			const reviewerOutcome = await this.runNode("reviewer");
			if (reviewerOutcome === "quit") {
				await this.endRun("quit");
				return;
			}
			const rv = reviewerOutcome.verdict;
			s.lastVerdict = { node: "reviewer", status: rv.status, reason: rv.reason };
			s.logger.log("verdict", { node: "reviewer", source: rv.source, status: rv.status, reason: rv.reason });
			if (rv.status === "reject") {
				s.logger.log("edge", { from: "reviewer", to: "builder" });
				continue;
			}
			if (rv.status === "approved") {
				s.logger.log("edge", { from: "reviewer", to: "ready" });
				s.phase = "ready";
				this.renderStatus();
				this.emitInfo(`✓ Ready. ${rv.reason}`);
				await this.endRun("ready");
				return;
			}
			// Unknown — pause.
			this.emitInfo(`Reviewer verdict could not be classified (${rv.status}). Pausing.`);
			const action = await this.awaitResume();
			if (action === "quit") {
				await this.endRun("quit");
				return;
			}
			if (action === "skip") {
				s.logger.log("edge", { from: "reviewer", to: "ready" });
				s.phase = "ready";
				this.renderStatus();
				await this.endRun("ready");
				return;
			}
			// retry: loop back to Builder
		}
	}

	// ── Single node run ─────────────────────────────────────────────

	private async runNode(
		node: NodeState,
	): Promise<"quit" | { finalText: string; verdict: RecordedVerdict }> {
		const s = this.state!;
		if (s.quitting) return "quit";
		const role = s.roles[this.roleForNode(node)];
		const seed = this.buildSeed(node);
		s.logger.log("node_enter", { node, seed });
		this.emitHeader(node);

		const ctx = this.ctx();
		if (!ctx) {
			throw new Error("Extension context is not bound; cannot run /goal.");
		}

		const model = this.resolveModel(ctx.modelRegistry, role.model);
		if (!model) {
			this.emitInfo(`No available model matches '${role.model}'. Pausing.`);
			const action = await this.awaitResume();
			if (action === "quit") return "quit";
			// retry: try again with fresh registry state
			return this.runNode(node);
		}

		s.recordedVerdict = undefined;
		const customTools: ToolDefinition[] = [this.buildRememberTool(this.roleForNode(node))];
		if (node !== "planner") {
			customTools.push(this.buildVerdictTool(node));
		}

		const customToolNames = customTools.map((t) => t.name);
		const allowedTools = role.tools.length > 0 ? [...role.tools, ...customToolNames] : undefined;
		const sessionResult = await createAgentSession({
			cwd: process.cwd(),
			agentDir: getAgentDir(),
			model,
			tools: allowedTools,
			customTools,
			sessionManager: SessionManager.inMemory(process.cwd()),
			modelRegistry: ctx.modelRegistry,
			resourceLoader: await makeLoader({
				cwd: process.cwd(),
				agentDir: getAgentDir(),
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPromptOverride: () => role.systemPrompt,
			}),
		});
		const session = sessionResult.session;
		s.currentSession = session;
		s.currentRole = this.roleForNode(node);

		let lastAssistantText = "";
		const unsubscribe = session.subscribe((evt: AgentSessionEvent) => {
			this.handleSubEvent(node, evt, (text) => {
				if (text) lastAssistantText = text;
			});
		});

		try {
			await session.prompt(seed);
		} catch (err) {
			this.emitInfo(`${NODE_LABELS[node]} crashed: ${(err as Error).message}`);
		} finally {
			unsubscribe();
		}

		// Fallback: pull final assistant text directly from the session state
		// in case the streaming subscription missed it (defense in depth).
		if (!lastAssistantText) {
			const fromState = (session.getLastAssistantText?.() ?? "").trim();
			if (fromState) {
				lastAssistantText = fromState;
				this.emitAssistant(node, fromState);
			}
		}

		if (this.state?.quitting || !this.state) {
			try { session.dispose(); } catch {}
			return "quit";
		}

		// If /goal pause aborted the node, do not classify or advance. Wait for
		// an explicit retry/skip/quit; a resume signal that arrived early is
		// preserved by awaitResume()'s resumePending latch.
		if (s.paused) {
			const action = await this.awaitResume();
			if (action === "quit") {
				try { session.dispose(); } catch {}
				return "quit";
			}
			if (action === "skip") {
				const verdict = { status: this.positiveStatus(node), reason: "manual skip", source: "skip" as const };
				s.logger.log("verdict", { node, source: "skip", status: verdict.status, reason: verdict.reason });
				s.logger.log("node_output", { node, output: lastAssistantText });
				try { session.dispose(); } catch {}
				s.currentSession = undefined;
				s.currentRole = undefined;
				this.emitVerdict(node, verdict);
				return { finalText: lastAssistantText, verdict };
			}
			try { session.dispose(); } catch {}
			s.currentSession = undefined;
			s.currentRole = undefined;
			return this.runNode(node);
		}

		// Resolve verdict.
		let verdict: RecordedVerdict;
		if (node === "planner") {
			verdict = { status: "done", reason: "plan ready", source: "tool" };
		} else if (s.recordedVerdict) {
			verdict = s.recordedVerdict;
		} else {
			// Fallback classifier.
			this.emitInfo(`${NODE_LABELS[node]} did not call its verdict tool; running classifier.`);
			const classified = await this.classifyVerdict(node, lastAssistantText, ctx);
			if (classified) {
				verdict = { ...classified, source: "classifier" };
				s.logger.log("verdict", { node, source: "classifier", status: verdict.status, reason: verdict.reason });
			} else {
				this.emitInfo(`Classifier could not extract a verdict for ${NODE_LABELS[node]}; pausing.`);
				const action = await this.awaitResume();
				if (action === "quit") return "quit";
				if (action === "skip") {
					verdict = { status: this.positiveStatus(node), reason: "manual skip", source: "skip" };
					s.logger.log("verdict", { node, source: "skip", status: verdict.status, reason: verdict.reason });
				} else {
					// retry: re-run the same node fresh.
					try {
						session.dispose();
					} catch {
						// ignore
					}
					s.currentSession = undefined;
					return this.runNode(node);
				}
			}
		}

		s.logger.log("node_output", { node, output: lastAssistantText });
		try {
			session.dispose();
		} catch {
			// ignore
		}
		s.currentSession = undefined;
		s.currentRole = undefined;

		this.emitVerdict(node, verdict);
		return { finalText: lastAssistantText, verdict };
	}

	// ── Verdict & remember tool factories ───────────────────────────

	private buildVerdictTool(node: Exclude<NodeState, "planner">): ToolDefinition {
		const { name, statuses } = this.verdictToolSpec(node);
		return defineTool({
			name,
			label: name,
			description: `Record the ${NODE_LABELS[node]} verdict and reason. Call this exactly once before finishing.`,
			parameters: Type.Object({
				status: StringEnum(statuses),
				reason: Type.String({ description: "One-line justification for the verdict." }),
			}),
			execute: async (_id, params) => {
				const p = params as { status: string; reason: string };
				if (this.state) {
					this.state.recordedVerdict = { status: p.status, reason: p.reason, source: "tool" };
				}
				return {
					content: [{ type: "text" as const, text: `Verdict recorded: ${p.status} — ${p.reason}` }],
					details: undefined,
				};
			},
		});
	}

	private buildRememberTool(role: RoleName): ToolDefinition {
		return defineTool({
			name: "remember",
			label: "remember",
			description:
				"Append a private note to this role's scratchpad. Notes survive across retries of this same node and are private to this role.",
			parameters: Type.Object({
				note: Type.String({ description: "Short note to remember." }),
			}),
			execute: async (_id, params) => {
				const p = params as { note: string };
				if (this.state) {
					this.state.scratchpads[role].push(p.note);
					this.state.logger.log("scratchpad_write", { role, note: p.note });
				}
				return { content: [{ type: "text" as const, text: "noted" }], details: undefined };
			},
		});
	}

	private verdictToolSpec(node: Exclude<NodeState, "planner">): {
		name: string;
		statuses: readonly string[];
	} {
		switch (node) {
			case "builder":
				return { name: "done", statuses: ["done", "not_done"] as const };
			case "verifier":
				return { name: "verdict", statuses: ["accept", "reject"] as const };
			case "reviewer":
				return { name: "verdict", statuses: ["approved", "reject"] as const };
		}
	}

	private positiveStatus(node: NodeState): string {
		switch (node) {
			case "planner":
				return "done";
			case "builder":
				return "done";
			case "verifier":
				return "accept";
			case "reviewer":
				return "approved";
		}
	}

	private roleForNode(node: NodeState): RoleName {
		switch (node) {
			case "planner":
				return "planner";
			case "builder":
				return "builder";
			case "verifier":
				return "verifier";
			case "reviewer":
				return "reviewer";
		}
	}

	// ── Seed construction ───────────────────────────────────────────

	private buildSeed(node: NodeState): string {
		const s = this.state!;
		const role = this.roleForNode(node);
		const notes = s.scratchpads[role];
		const lastVerdict = s.lastVerdict;
		const lines: string[] = [];

		lines.push(`# Goal\n${s.goal}\n`);
		if (s.conversationTail) {
			lines.push(`# Recent conversation\n${s.conversationTail}\n`);
		}
		if (node !== "planner") {
			lines.push(`# Plan (from Planner)\n${s.plan}\n`);
		}
		if (lastVerdict && node !== "planner") {
			lines.push(
				`# Upstream handoff (from ${NODE_LABELS[lastVerdict.node]})\nstatus: ${lastVerdict.status}\nreason: ${lastVerdict.reason}\n`,
			);
		}
		if (notes.length > 0) {
			lines.push(`# Your private notes from earlier attempts\n- ${notes.join("\n- ")}\n`);
		}
		if (s.pendingSteer && (node === "builder" || node === "verifier" || node === "reviewer")) {
			lines.push(`# User steer (delivered on retry)\n${s.pendingSteer}\n`);
			s.pendingSteer = undefined;
		}
		lines.push(
			`# Your role\nYou are the ${NODE_LABELS[node]} node. Follow your system prompt. Call your verdict tool when you finish.`,
		);
		return lines.join("\n");
	}

	// ── Sub-session event forwarding ────────────────────────────────

	private handleSubEvent(
		node: NodeState,
		evt: AgentSessionEvent,
		onAssistantText: (text: string) => void,
	): void {
		switch (evt.type) {
			case "tool_execution_start": {
				const args = typeof evt.args === "object" ? JSON.stringify(evt.args) : String(evt.args);
				this.emitTool(node, `${evt.toolName} ${truncate(args, 160)}`);
				break;
			}
			case "message_end": {
				const msg = evt.message;
				if (msg.role === "assistant") {
					const text = extractAssistantText(msg);
					if (text) {
						onAssistantText(text);
						this.emitAssistant(node, text);
					}
				}
				break;
			}
			default:
				// Other events (message_update, tool_execution_update, agent_start/end)
				// are ignored to keep transcript compact. The status-line spinner +
				// elapsed clock provide liveness.
				break;
		}
	}

	// ── Fallback classifier ────────────────────────────────────────

	private async classifyVerdict(
		node: Exclude<NodeState, "planner">,
		finalText: string,
		ctx: ExtensionContext,
	): Promise<{ status: string; reason: string } | null> {
		const s = this.state!;
		const role = s.roles[this.roleForNode(node)];
		const model = this.resolveClassifierModel(ctx.modelRegistry, role.model);
		if (!model) return null;
		const { name, statuses } = this.verdictToolSpec(node);

		let captured: { status: string; reason: string } | undefined;
		const verdictTool = defineTool({
			name,
			label: name,
			description: `Record the ${NODE_LABELS[node]} verdict and reason inferred from the candidate text.`,
			parameters: Type.Object({
				status: StringEnum(statuses),
				reason: Type.String(),
			}),
			execute: async (_id, params) => {
				const p = params as { status: string; reason: string };
				captured = { status: p.status, reason: p.reason };
				return { content: [{ type: "text" as const, text: "ok" }], details: undefined };
			},
		});

		// CRITICAL: noTools:"builtin" disables built-in read/bash/edit/write
		// but KEEPS our custom verdict tool. Using "all" would strip the
		// custom tool too and the classifier would silently fail.
		const result = await createAgentSession({
			cwd: process.cwd(),
			agentDir: getAgentDir(),
			model,
			noTools: "builtin",
			customTools: [verdictTool],
			sessionManager: SessionManager.inMemory(process.cwd()),
			modelRegistry: ctx.modelRegistry,
			resourceLoader: await makeLoader({
				cwd: process.cwd(),
				agentDir: getAgentDir(),
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPromptOverride: () =>
					`You are a strict verdict classifier. Read the candidate final assistant text and call the ${name} tool exactly once with the verdict you infer. Allowed status values: ${statuses.join(", ")}. Do not output anything else.`,
			}),
		});

		try {
			await result.session.prompt(
				`Candidate final assistant text from the ${NODE_LABELS[node]} node:\n\n<<<\n${finalText}\n>>>\n\nCall the ${name} tool now with the verdict you infer. Status must be one of: ${statuses.join(", ")}.`,
			);
		} catch {
			// ignore
		} finally {
			try {
				result.session.dispose();
			} catch {
				// ignore
			}
		}

		if (!captured) return null;
		if (!statuses.includes(captured.status)) return null;
		return captured;
	}

	// ── Model resolution (provider-agnostic) ───────────────────────

	private resolveClassifierModel(registry: ModelRegistry, fallbackPattern: string): Model<any> | undefined {
		// Spec requires the fallback classifier to be a one-shot Sonnet session.
		// Resolve by model id/name across available providers rather than hardcoding
		// a provider. Fall back only if no Sonnet-family model is available.
		for (const pattern of ["claude-sonnet-4-5", "claude-sonnet-4", "sonnet"]) {
			const model = this.resolveModel(registry, pattern);
			if (model && /sonnet/i.test(`${model.provider}/${model.id}/${model.name ?? ""}`)) return model;
		}
		return this.resolveModel(registry, fallbackPattern);
	}

	private resolveModel(registry: ModelRegistry, idPattern: string): Model<any> | undefined {
		const all = registry.getAvailable();
		if (all.length === 0) return undefined;
		if (!idPattern) return all[0];
		const exact = all.find((m) => m.id === idPattern);
		if (exact) return exact;
		const lower = idPattern.toLowerCase();
		const partial = all.find(
			(m) =>
				m.id.toLowerCase().includes(lower) ||
				lower.includes(m.id.toLowerCase()) ||
				m.name?.toLowerCase().includes(lower),
		);
		return partial ?? all[0];
	}

	// ── Pause / resume latch ────────────────────────────────────────

	private async awaitResume(): Promise<"retry" | "skip" | "quit"> {
		const s = this.state!;
		// Clear resumePending=false BEFORE installing the waiter so a signal
		// that already arrived is not lost on re-entry.
		if (s.resumePending) {
			s.resumePending = false;
			const kind = s.resumeKind ?? "retry";
			s.resumeKind = undefined;
			s.paused = false;
			return kind;
		}
		s.paused = true;
		this.renderStatus();
		await new Promise<void>((resolve) => {
			s.resumeResolve = resolve;
		});
		const kind = s.resumeKind ?? "retry";
		s.resumeKind = undefined;
		s.paused = false;
		this.renderStatus();
		return kind;
	}

	// ── Run teardown ────────────────────────────────────────────────

	private async endRun(terminal: "ready" | "quit"): Promise<void> {
		if (!this.state) return;
		const s = this.state;
		const elapsed = Date.now() - s.startedAt;
		s.logger.log("run_end", { terminal, elapsed });
		if (s.timer) {
			clearInterval(s.timer);
			s.timer = undefined;
		}
		const ctx = this.ctx();
		ctx?.ui.setStatus(STATUS_KEY, undefined);
		ctx?.ui.setWidget(WIDGET_KEY, undefined, { placement: "belowEditor" });
		this.state = undefined;
		this.emitInfo(`/goal ${terminal}. Elapsed ${formatElapsed(elapsed)}.`);
	}

	// ── Status-line rendering & timer ───────────────────────────────

	private startTimer(): void {
		if (!this.state || this.state.timer) return;
		this.state.timer = setInterval(() => {
			if (!this.state) return;
			this.state.spinnerFrame = (this.state.spinnerFrame + 1) % SPINNER.length;
			this.renderStatus();
		}, 1000);
	}

	private renderStatus(): void {
		const ctx = this.ctx();
		if (!ctx || !this.state) return;
		const s = this.state;
		const spinner = SPINNER[s.spinnerFrame];
		const phaseLabel =
			s.phase === "ready"
				? "READY"
				: s.phase === "idle"
				? "IDLE"
				: NODE_LABELS[s.phase as NodeState] ?? s.phase.toUpperCase();
		const currentSegment = `${spinner} ${phaseLabel}`;

		const order = BREADCRUMB_ORDER;
		const currentIdx = order.findIndex((b) => b.phase === s.phase);
		const breadcrumb = order
			.map((b, idx) => {
				if (s.phase === "ready") return idx <= currentIdx ? `✓${b.label}` : b.label;
				if (idx < currentIdx) return `✓${b.label}`;
				if (idx === currentIdx) return `▶${b.label}`;
				return b.label;
			})
			.join(" ▸ ");

		const loops = `loops ${s.loops}`;
		const elapsed = formatElapsed(Date.now() - s.startedAt);
		const verdict = s.lastVerdict
			? `last: ${NODE_LABELS[s.lastVerdict.node]} ${s.lastVerdict.status} — ${truncate(s.lastVerdict.reason, 60)}`
			: "last: —";

		const segments = [currentSegment, breadcrumb, loops, elapsed, verdict];
		if (s.paused) segments.unshift("PAUSED");
		const statusText = segments.join(" │ ");
		// Keep setStatus for Pi's native footer, but also render an explicit
		// below-editor widget. Some user statusline extensions compress or
		// truncate extension statuses; the widget keeps the state-machine
		// dashboard visible, matching the spec mock.
		ctx.ui.setStatus(STATUS_KEY, statusText);
		ctx.ui.setWidget(WIDGET_KEY, [statusText], { placement: "belowEditor" });
	}

	// ── Renderer & emit helpers ─────────────────────────────────────

	private ensureRenderer(): void {
		if (!this.state || this.state.customMessageRendererRegistered) return;
		// Renderer is registered once in index.ts at extension load time.
		// This per-run latch remains only to avoid changing the orchestrator flow.
		this.state.customMessageRendererRegistered = true;
	}

	private emitHeader(node: NodeState): void {
		const bar = "━".repeat(8);
		this.pi.sendMessage({
			customType: GOAL_MSG_TYPE,
			content: `${bar} ${NODE_LABELS[node]} ${bar}`,
			display: true,
			details: { kind: "header" } satisfies GoalStreamDetails,
		});
	}

	private emitTool(node: NodeState, text: string): void {
		this.pi.sendMessage({
			customType: GOAL_MSG_TYPE,
			content: `▸ ${text}`,
			display: true,
			details: { kind: "tool" } satisfies GoalStreamDetails,
		});
	}

	private emitAssistant(node: NodeState, text: string): void {
		this.pi.sendMessage({
			customType: GOAL_MSG_TYPE,
			content: text,
			display: true,
			details: { kind: "assistant" } satisfies GoalStreamDetails,
		});
	}

	private emitVerdict(node: NodeState, verdict: RecordedVerdict): void {
		const positive = verdict.status === this.positiveStatus(node);
		const marker: "✓" | "↻" | "✗" = positive ? "✓" : verdict.status === "not_done" ? "↻" : "✗";
		const tag = verdict.source === "classifier" ? " [classifier]" : verdict.source === "skip" ? " [skipped]" : "";
		this.pi.sendMessage({
			customType: GOAL_MSG_TYPE,
			content: `${marker} ${NODE_LABELS[node]} → ${verdict.status}${tag} — ${verdict.reason}`,
			display: true,
			details: { kind: "verdict", positive, marker } satisfies GoalStreamDetails,
		});
	}

	private emitInfo(text: string): void {
		this.pi.sendMessage({
			customType: GOAL_MSG_TYPE,
			content: `/goal: ${text}`,
			display: true,
			details: { kind: "info" } satisfies GoalStreamDetails,
		});
	}
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractAssistantText(message: any): string {
	// Join ALL text parts of the last assistant message — a trailing text
	// part after tool calls is exactly where the prose verdict lives.
	if (!message || message.role !== "assistant") return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (part && typeof part === "object") {
			const p = part as { type?: string; text?: string };
			if ((p.type === "text" || p.type === undefined) && typeof p.text === "string") {
				parts.push(p.text);
			}
		}
	}
	return parts.join("\n").trim();
}
