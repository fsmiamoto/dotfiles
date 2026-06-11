/**
 * Generic workflow engine: executes any validated WorkflowGraph node by node.
 *
 * Node kinds: agent (fresh sub-agent session reporting via an `outcome` tool
 * whose enum = the node's transition labels), command (deterministic shell
 * exec), manual (pause and ask the user), terminal (final agent pass, ends
 * the run). State persists to state.json after every transition so a run can
 * be resumed; every run appends a JSONL log usable for benchmarking.
 */

import { exec } from "node:child_process";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionEvent,
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { WorkflowGraph, WorkflowNode, WorkflowTransition } from "./schema.ts";
import {
	createRunLogger,
	saveState,
	type EngineState,
	type RunLogger,
} from "./store.ts";
import { extractAssistantText, resolveModel, runSubAgent } from "./subagent.ts";
import { WORKFLOW_MSG_TYPE, type WorkflowStreamDetails } from "./renderer.ts";

const MAX_STEPS = 30;
const MAX_VISITS_PER_NODE = 3;
const COMMAND_TIMEOUT_MS = 180_000;
const ARTIFACT_LIMIT = 6_000;
const SEED_ARTIFACT_LIMIT = 2_000;
const STATUS_KEY = "workflow-status";
const WIDGET_KEY = "workflow-card";
const FAILURE_ALIASES = ["failed", "fail", "error"];

interface ActiveRun {
	state: EngineState;
	logger: RunLogger;
	paused: boolean;
	quitting: boolean;
	pendingSteer?: string;
	currentSession?: AgentSession;
	currentNode?: WorkflowNode;
	recordedOutcome?: { label: string; reason: string; source: "tool" | "implicit" | "classifier" | "skip" | "command" | "manual" };
	awaitingManual?: { node: WorkflowNode; resolve: (text: string) => void };
	resumePending: boolean;
	resumeKind?: "retry" | "skip" | "quit";
	resumeResolve?: () => void;
	timer?: ReturnType<typeof setInterval>;
	lastOutcomeLine?: string;
}

function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return m === 0 ? `${s}s` : `${m}m${String(s).padStart(2, "0")}s`;
}

function truncate(text: string, max = 200): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function tail(text: string, max: number): string {
	return text.length <= max ? text : `…${text.slice(-max)}`;
}

export class WorkflowEngine {
	private run: ActiveRun | undefined;
	private readonly pi: ExtensionAPI;
	private readonly ctx: () => ExtensionContext | undefined;
	private readonly onEnd: () => void;

	constructor(pi: ExtensionAPI, getCtx: () => ExtensionContext | undefined, onEnd: () => void) {
		this.pi = pi;
		this.ctx = getCtx;
		this.onEnd = onEnd;
	}

	isRunning(): boolean {
		return !!this.run;
	}

	statusLine(): string {
		if (!this.run) return "/workflow engine is idle.";
		const r = this.run;
		const node = r.currentNode ? `${r.currentNode.id} (${r.currentNode.kind})` : "—";
		return `Running "${r.state.graph.title}" — node ${node}, step ${r.state.steps}, elapsed ${formatElapsed(Date.now() - r.state.startedAt)}${r.paused ? ", PAUSED" : ""}${r.awaitingManual ? ", waiting for your answer" : ""}`;
	}

	/** Start executing a graph (fresh run or resumed state). */
	async start(graph: WorkflowGraph, workflowPath: string, resumeFrom?: EngineState): Promise<void> {
		if (this.run) {
			this.emitInfo("a workflow is already running. Use /workflow quit first.");
			return;
		}
		// Normalize resumed state defensively — it may come from an older format.
		const state: EngineState = {
			graph,
			workflowPath,
			currentNodeId: resumeFrom?.currentNodeId ?? graph.start,
			steps: resumeFrom?.steps ?? 0,
			visits: resumeFrom?.visits ?? {},
			artifacts: resumeFrom?.artifacts ?? {},
			history: resumeFrom?.history ?? [],
			startedAt: resumeFrom?.startedAt ?? Date.now(),
		};
		const logger = createRunLogger(graph.id);
		this.run = {
			state,
			logger,
			paused: false,
			quitting: false,
			resumePending: false,
		};
		logger.log("run_start", {
			id: graph.id,
			workflowPath,
			resumed: !!resumeFrom,
			startNode: state.currentNodeId,
		});
		this.emitInfo(`run started${resumeFrom ? " (resumed)" : ""}. Log: ${logger.logPath}`);
		this.startTimer();
		this.renderStatus();
		try {
			await this.runLoop();
		} catch (err) {
			this.emitInfo(`run crashed: ${(err as Error).message}`);
			await this.endRun("crashed");
		}
	}

	// ── Control verbs ───────────────────────────────────────────────

	async pause(): Promise<void> {
		if (!this.run) return;
		const r = this.run;
		if (r.awaitingManual) {
			this.emitInfo("waiting for your answer to a manual node — type it, or /workflow quit.");
			return;
		}
		if (r.paused) {
			this.emitInfo("already paused.");
			return;
		}
		r.logger.log("action", { action: "pause" });
		r.paused = true;
		if (r.currentSession) {
			try {
				await r.currentSession.abort();
			} catch {
				// ignore
			}
		}
		this.renderStatus();
		this.emitInfo("paused. Use /workflow retry, /workflow skip, or /workflow quit.");
	}

	async retry(): Promise<void> {
		this.resumeWith("retry");
	}

	async skip(): Promise<void> {
		this.resumeWith("skip");
	}

	private resumeWith(kind: "retry" | "skip"): void {
		if (!this.run) return;
		if (!this.run.paused) {
			this.emitInfo(`/workflow ${kind} only works while paused. Use /workflow pause first.`);
			return;
		}
		this.run.logger.log("action", { action: kind });
		this.signalResume(kind);
	}

	async quit(): Promise<void> {
		if (!this.run) return;
		const r = this.run;
		r.logger.log("action", { action: "quit" });
		r.quitting = true;
		if (r.awaitingManual) {
			const waiter = r.awaitingManual;
			r.awaitingManual = undefined;
			waiter.resolve("");
			return;
		}
		if (r.paused) {
			this.signalResume("quit");
			return;
		}
		if (r.currentSession) {
			try {
				await r.currentSession.abort();
			} catch {
				// ignore
			}
		}
	}

	/** Typed text during a run: answer a manual node, steer the live node, or queue for retry. */
	async steerOrAnswer(text: string): Promise<void> {
		if (!this.run) return;
		const r = this.run;
		r.logger.log("action", { action: "steer", text });
		if (r.awaitingManual) {
			const waiter = r.awaitingManual;
			r.awaitingManual = undefined;
			waiter.resolve(text);
			return;
		}
		if (r.paused) {
			r.pendingSteer = r.pendingSteer ? `${r.pendingSteer}\n${text}` : text;
			this.emitInfo(`steer queued for next node run: ${truncate(text, 120)}`);
			return;
		}
		if (r.currentSession) {
			try {
				await r.currentSession.steer(text);
				this.emitInfo(`steer → ${r.currentNode?.id ?? "?"}: ${truncate(text, 120)}`);
			} catch (err) {
				this.emitInfo(`steer failed: ${(err as Error).message}`);
			}
		}
	}

	private signalResume(kind: "retry" | "skip" | "quit"): void {
		const r = this.run;
		if (!r) return;
		r.resumeKind = kind;
		if (r.resumeResolve) {
			const resolve = r.resumeResolve;
			r.resumeResolve = undefined;
			resolve();
		} else {
			r.resumePending = true;
		}
	}

	private async awaitResume(): Promise<"retry" | "skip" | "quit"> {
		const r = this.run!;
		if (r.resumePending) {
			r.resumePending = false;
			const kind = r.resumeKind ?? "retry";
			r.resumeKind = undefined;
			r.paused = false;
			return kind;
		}
		r.paused = true;
		this.renderStatus();
		await new Promise<void>((resolve) => {
			r.resumeResolve = resolve;
		});
		const kind = r.resumeKind ?? "retry";
		r.resumeKind = undefined;
		r.paused = false;
		this.renderStatus();
		return kind;
	}

	// ── Main loop ───────────────────────────────────────────────────

	private nodeById(id: string): WorkflowNode {
		const node = this.run!.state.graph.nodes.find((n) => n.id === id);
		if (!node) throw new Error(`node "${id}" not found in graph`);
		return node;
	}

	private async runLoop(): Promise<void> {
		const r = this.run!;
		const s = r.state;
		while (true) {
			if (r.quitting) {
				await this.endRun("quit");
				return;
			}
			const node = this.nodeById(s.currentNodeId);
			r.currentNode = node;

			// Loop guards.
			const visits = (s.visits[node.id] ?? 0) + 1;
			if (s.steps + 1 > MAX_STEPS || visits > MAX_VISITS_PER_NODE) {
				const why =
					visits > MAX_VISITS_PER_NODE
						? `node "${node.id}" would run for the ${visits}th time (limit ${MAX_VISITS_PER_NODE})`
						: `step limit ${MAX_STEPS} reached`;
				r.logger.log("guard", { node: node.id, why });
				this.emitInfo(`loop guard: ${why} — pausing. /workflow retry runs it anyway, /workflow skip follows its first edge, /workflow quit stops.`);
				const action = await this.awaitResume();
				if (action === "quit") {
					await this.endRun("quit");
					return;
				}
				if (action === "skip") {
					const edge = node.transitions[0];
					if (!edge) {
						await this.endRun("ready");
						return;
					}
					s.currentNodeId = edge.to;
					continue;
				}
				// retry: fall through and run the node.
			}
			s.visits[node.id] = visits;
			s.steps += 1;
			r.logger.log("node_enter", { node: node.id, kind: node.kind, visit: visits, step: s.steps });
			this.emitHeader(node, visits);
			this.renderStatus();

			const startedAt = Date.now();
			let result: { label: string; reason: string; artifact: string } | "quit";
			switch (node.kind) {
				case "command":
					result = await this.runCommandNode(node);
					break;
				case "manual":
					result = await this.runManualNode(node);
					break;
				default:
					result = await this.runAgentNode(node);
					break;
			}
			if (result === "quit" || r.quitting) {
				await this.endRun("quit");
				return;
			}

			s.artifacts[node.id] = truncate(result.artifact, ARTIFACT_LIMIT);
			s.history.push({
				node: node.id,
				kind: node.kind,
				visit: visits,
				outcome: result.label,
				reason: truncate(result.reason, 500),
				startedAt,
				endedAt: Date.now(),
			});
			r.logger.log("outcome", {
				node: node.id,
				label: result.label,
				reason: result.reason,
				elapsedMs: Date.now() - startedAt,
			});
			this.emitOutcome(node, result.label, result.reason);
			this.persist();

			// Terminal node → done.
			if (node.transitions.length === 0) {
				await this.endRun("ready");
				return;
			}

			const edge = this.resolveEdge(node, result.label);
			if (!edge) {
				this.emitInfo(
					`no edge for outcome "${result.label}" from "${node.id}" (edges: ${node.transitions.map((t) => t.on).join(", ")}) — pausing. /workflow retry re-runs the node, /workflow skip follows the first edge, /workflow quit stops.`,
				);
				const action = await this.awaitResume();
				if (action === "quit") {
					await this.endRun("quit");
					return;
				}
				if (action === "retry") continue;
				s.currentNodeId = node.transitions[0].to;
				r.logger.log("edge", { from: node.id, on: `${result.label}→skip`, to: s.currentNodeId });
				this.persist();
				continue;
			}
			r.logger.log("edge", { from: node.id, on: edge.on, to: edge.to });
			s.currentNodeId = edge.to;
			this.persist();
			this.renderStatus();
		}
	}

	private resolveEdge(node: WorkflowNode, label: string): WorkflowTransition | undefined {
		const exact = node.transitions.find((t) => t.on === label);
		if (exact) return exact;
		if (FAILURE_ALIASES.includes(label)) {
			const alias = node.transitions.find((t) => FAILURE_ALIASES.includes(t.on));
			if (alias) return alias;
		}
		// A positive outcome with a single edge is unambiguous.
		if (!FAILURE_ALIASES.includes(label) && node.transitions.length === 1) return node.transitions[0];
		return undefined;
	}

	// ── Node runners ────────────────────────────────────────────────

	private async runCommandNode(node: WorkflowNode): Promise<{ label: string; reason: string; artifact: string } | "quit"> {
		const r = this.run!;
		const command = node.command!;
		this.emitTool(`$ ${command}`);
		r.logger.log("command_exec", { node: node.id, command });
		const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
			exec(command, { timeout: COMMAND_TIMEOUT_MS, cwd: process.cwd(), shell: "/bin/bash" }, (err, stdout, stderr) => {
				const code = err ? ((err as any).code ?? 1) : 0;
				resolve({ code: typeof code === "number" ? code : 1, stdout, stderr });
			});
		});
		if (r.quitting) return "quit";
		const ok = result.code === 0;
		const artifact = [
			`$ ${command}`,
			`exit ${result.code}`,
			result.stdout.trim() ? `stdout:\n${tail(result.stdout.trim(), 2000)}` : "",
			result.stderr.trim() ? `stderr:\n${tail(result.stderr.trim(), 1000)}` : "",
		]
			.filter(Boolean)
			.join("\n");
		if (result.stdout.trim()) this.emitAssistant(tail(result.stdout.trim(), 1500));
		return {
			label: ok ? "done" : "failed",
			reason: ok ? `command exited 0` : `command exited ${result.code}`,
			artifact,
		};
	}

	private async runManualNode(node: WorkflowNode): Promise<{ label: string; reason: string; artifact: string } | "quit"> {
		const r = this.run!;
		const labels = node.transitions.map((t) => t.on);
		while (true) {
			const options =
				labels.length > 1 ? `\nAnswer with one of: ${labels.join(" | ")} — or free text to attach context to the single matching option.` : "";
			this.emitAsk(
				`⏸ ${node.title} — your input is needed:\n${node.prompt}${node.successCriteria.length ? `\nCriteria:\n${node.successCriteria.map((c) => `- ${c}`).join("\n")}` : ""}${options}\n(type your answer; /workflow quit to stop)`,
			);
			this.renderStatus();
			const answer = await new Promise<string>((resolve) => {
				r.awaitingManual = { node, resolve };
			});
			this.renderStatus();
			if (r.quitting) return "quit";
			const trimmed = answer.trim();
			if (!trimmed) continue;
			const lower = trimmed.toLowerCase();
			const exact = node.transitions.find((t) => t.on === lower || lower.startsWith(`${t.on} `));
			const edgeLabel = exact?.on ?? (node.transitions.length === 1 ? node.transitions[0].on : undefined);
			if (!edgeLabel) {
				this.emitInfo(`couldn't match "${truncate(trimmed, 60)}" to an option (${labels.join(" | ")}). Try again.`);
				continue;
			}
			return { label: edgeLabel, reason: "user answered", artifact: `user answer: ${trimmed}` };
		}
	}

	private async runAgentNode(node: WorkflowNode): Promise<{ label: string; reason: string; artifact: string } | "quit"> {
		const r = this.run!;
		const ctx = this.ctx();
		if (!ctx) throw new Error("extension context is not bound");
		const model = resolveModel(ctx.modelRegistry, ctx.model?.id ?? "");
		if (!model) {
			this.emitInfo("no model available — pausing.");
			const action = await this.awaitResume();
			if (action === "quit") return "quit";
			return this.runAgentNode(node);
		}

		const isTerminal = node.transitions.length === 0;
		const labels = node.transitions.map((t) => t.on);
		r.recordedOutcome = undefined;
		const customTools: ToolDefinition[] = isTerminal ? [] : [this.buildOutcomeTool(labels)];

		const finalText = await runSubAgent({
			ctx,
			systemPrompt: this.nodeSystemPrompt(node),
			seed: this.buildSeed(node),
			model,
			customTools,
			onSession: (session) => {
				r.currentSession = session;
			},
			onEvent: (evt: AgentSessionEvent) => {
				if (evt.type === "tool_execution_start") {
					const args = typeof evt.args === "object" ? JSON.stringify(evt.args) : String(evt.args);
					this.emitTool(`▸ ${evt.toolName} ${truncate(args, 160)}`);
				} else if (evt.type === "message_end" && evt.message.role === "assistant") {
					const text = extractAssistantText(evt.message);
					if (text) this.emitAssistant(text);
				}
			},
		});
		r.currentSession = undefined;
		r.logger.log("node_output", { node: node.id, output: finalText });
		if (r.quitting) return "quit";

		// Paused mid-node (session aborted): wait for an explicit decision.
		if (r.paused) {
			const action = await this.awaitResume();
			if (action === "quit") return "quit";
			if (action === "retry") return this.runAgentNode(node);
			// skip: positive outcome on the first edge.
			return {
				label: isTerminal ? "done" : node.transitions[0].on,
				reason: "manual skip",
				artifact: finalText || "(skipped)",
			};
		}

		if (isTerminal) {
			return { label: "done", reason: "terminal node finished", artifact: finalText };
		}
		// Re-widen: the outcome tool's execute closure assigns this, which TS's
		// control-flow analysis can't see past the `= undefined` above.
		const recorded = r.recordedOutcome as ActiveRun["recordedOutcome"];
		if (recorded) {
			return { label: recorded.label, reason: recorded.reason, artifact: finalText };
		}
		if (labels.length === 1) {
			return { label: labels[0], reason: "implicit (single edge, no outcome call)", artifact: finalText };
		}
		this.emitInfo(`node "${node.id}" didn't call its outcome tool; classifying from its final message.`);
		const classified = await this.classifyOutcome(labels, finalText, ctx);
		if (classified) {
			return { label: classified.label, reason: `${classified.reason} [classifier]`, artifact: finalText };
		}
		this.emitInfo(`couldn't classify the outcome for "${node.id}" — pausing. /workflow retry re-runs it, /workflow skip takes the first edge, /workflow quit stops.`);
		const action = await this.awaitResume();
		if (action === "quit") return "quit";
		if (action === "retry") return this.runAgentNode(node);
		return { label: node.transitions[0].on, reason: "manual skip", artifact: finalText };
	}

	private buildOutcomeTool(labels: string[]): ToolDefinition {
		return defineTool({
			name: "outcome",
			label: "outcome",
			description: `Report this node's outcome. Call exactly once, when your work on this node is finished.`,
			parameters: Type.Object({
				status: StringEnum(labels),
				reason: Type.String({
					description: "1-3 sentences: what you did/found, for the next node to build on.",
				}),
			}),
			execute: async (_id, params) => {
				const p = params as { status: string; reason: string };
				const r = this.run;
				if (r) {
					r.recordedOutcome = { label: p.status, reason: p.reason, source: "tool" };
					const session = r.currentSession;
					setTimeout(() => {
						try {
							session?.abort();
						} catch {
							// ignore
						}
					}, 0);
				}
				return {
					content: [{ type: "text" as const, text: `Outcome recorded: ${p.status} — ${p.reason}` }],
					details: undefined,
				};
			},
		});
	}

	private async classifyOutcome(
		labels: string[],
		finalText: string,
		ctx: ExtensionContext,
	): Promise<{ label: string; reason: string } | null> {
		if (!finalText.trim()) return null;
		let model = resolveModel(ctx.modelRegistry, "sonnet");
		model ??= resolveModel(ctx.modelRegistry, ctx.model?.id ?? "");
		if (!model) return null;
		let captured: { label: string; reason: string } | undefined;
		const tool = defineTool({
			name: "outcome",
			label: "outcome",
			description: "Record the outcome inferred from the candidate text.",
			parameters: Type.Object({
				status: StringEnum(labels),
				reason: Type.String(),
			}),
			execute: async (_id, params) => {
				const p = params as { status: string; reason: string };
				captured = { label: p.status, reason: p.reason };
				return { content: [{ type: "text" as const, text: "ok" }], details: undefined };
			},
		});
		try {
			await runSubAgent({
				ctx,
				systemPrompt: `You are a strict outcome classifier. Read the candidate final text of a workflow node and call the outcome tool exactly once with the status you infer. Allowed: ${labels.join(", ")}. Output nothing else.`,
				seed: `Candidate final text:\n\n<<<\n${finalText}\n>>>\n\nCall the outcome tool now. Status must be one of: ${labels.join(", ")}.`,
				model,
				noTools: "builtin",
				customTools: [tool],
			});
		} catch {
			// ignore
		}
		// Re-widen: `captured` is only assigned inside the tool closure, which
		// TS's control-flow analysis can't see.
		const got = captured as { label: string; reason: string } | undefined;
		if (!got || !labels.includes(got.label)) return null;
		return got;
	}

	// ── Seeds ───────────────────────────────────────────────────────

	private nodeSystemPrompt(node: WorkflowNode): string {
		const isTerminal = node.transitions.length === 0;
		return [
			`You are one node in a workflow state machine executing toward an objective. You run in a fresh session: everything you know arrives in the seed message; everything you pass on travels through your outcome reason and your final work products (files, command output).`,
			isTerminal
				? `You are the TERMINAL node: present the final result of the whole workflow to the user as your final message. Be concrete and complete — this is the user-facing deliverable.`
				: `Work ONLY on this node's task. When finished, call the \`outcome\` tool exactly once with the status that honestly reflects the result.`,
		].join("\n\n");
	}

	private buildSeed(node: WorkflowNode): string {
		const r = this.run!;
		const s = r.state;
		const lines: string[] = [`# Objective\n${s.graph.objective}\n`];
		const visit = s.visits[node.id] ?? 1;
		const path = s.history.slice(-8).map((h) => `${h.node}→${h.outcome}`).join(", ");
		lines.push(
			`# Workflow position\nWorkflow: ${s.graph.title}\nThis node: "${node.id}" — ${node.title} (visit ${visit})${path ? `\nRecent path: ${path}` : ""}\n`,
		);

		const priorIds = [...new Set(s.history.map((h) => h.node))].filter((id) => id !== node.id);
		const recent = priorIds.slice(-6);
		if (recent.length > 0) {
			const sections = recent.map((id) => {
				const n = s.graph.nodes.find((x) => x.id === id);
				const h = [...s.history].reverse().find((x) => x.node === id);
				return `### ${id} — ${n?.title ?? ""} (outcome: ${h?.outcome ?? "?"})\n${h?.reason ?? ""}\n${truncate(s.artifacts[id] ?? "", SEED_ARTIFACT_LIMIT)}`;
			});
			lines.push(`# Outputs from completed nodes\n${sections.join("\n\n")}\n`);
		}
		if (visit > 1) {
			const lastSelf = [...s.history].reverse().find((h) => h.node === node.id);
			if (lastSelf) {
				lines.push(`# Your previous attempt\noutcome: ${lastSelf.outcome}\nreason: ${lastSelf.reason}\n`);
			}
		}
		lines.push(`# Your task\n${node.prompt}\n`);
		if (node.successCriteria.length > 0) {
			lines.push(`# Success criteria\n${node.successCriteria.map((c) => `- ${c}`).join("\n")}\n`);
		}
		if (r.pendingSteer) {
			lines.push(`# User steer\n${r.pendingSteer}\n`);
			r.pendingSteer = undefined;
		}
		if (node.transitions.length > 0) {
			lines.push(
				`# Finishing\nCall the \`outcome\` tool exactly once with status one of: ${node.transitions.map((t) => t.on).join(" | ")}.`,
			);
		}
		return lines.join("\n");
	}

	// ── Persistence & teardown ──────────────────────────────────────

	private persist(): void {
		const r = this.run;
		if (!r) return;
		saveState({ active: r.state });
	}

	private async endRun(terminal: "ready" | "quit" | "crashed"): Promise<void> {
		const r = this.run;
		if (!r) return;
		const s = r.state;
		const elapsed = Date.now() - s.startedAt;
		r.logger.log("run_end", { terminal, elapsedMs: elapsed, steps: s.steps });
		if (r.timer) {
			clearInterval(r.timer);
			r.timer = undefined;
		}
		const ctx = this.ctx();
		ctx?.ui.setStatus(STATUS_KEY, undefined);
		ctx?.ui.setWidget(WIDGET_KEY, undefined, { placement: "belowEditor" });
		// Clear persisted active state on a clean end; keep it for resume otherwise.
		if (terminal === "ready") saveState({});
		this.run = undefined;
		this.onEnd();

		if (terminal === "ready") {
			const byNode = s.history
				.map((h) => `${h.node}${h.visit > 1 ? `#${h.visit}` : ""} ${formatElapsed(h.endedAt - h.startedAt)}`)
				.join(" · ");
			this.emitOutcomeRaw(`✓ Workflow "${s.graph.title}" complete — ${s.steps} node runs in ${formatElapsed(elapsed)}.`, true);
			this.emitInfo(`timings: ${byNode}`);
			this.emitInfo(`log: ${r.logger.logPath}`);
		} else {
			this.emitInfo(`run ended (${terminal}) after ${formatElapsed(elapsed)}. ${terminal === "quit" ? "Resume later with /workflow resume." : ""}`);
		}
	}

	// ── Status widget ───────────────────────────────────────────────

	private startTimer(): void {
		const r = this.run;
		if (!r || r.timer) return;
		r.timer = setInterval(() => this.renderStatus(), 1000);
	}

	private renderStatus(): void {
		const ctx = this.ctx();
		const r = this.run;
		if (!ctx || !r) return;
		const s = r.state;
		ctx.ui.setStatus(
			STATUS_KEY,
			ctx.ui.theme.fg(r.paused ? "warning" : "accent", `◆ /workflow${r.paused ? " paused" : ""}`),
		);

		const theme = ctx.ui.theme;
		const width = 76;
		const contentWidth = width - 4;
		const line = (styled: string): string => {
			const clipped = truncateToWidth(styled, contentWidth);
			const pad = Math.max(0, contentWidth - visibleWidth(clipped));
			return theme.fg("border", "│") + ` ${clipped}${" ".repeat(pad)} ` + theme.fg("border", "│");
		};
		const title = " ◆ /workflow ";
		const lead = "─".repeat(3);
		const tailBar = "─".repeat(Math.max(0, width - 2 - visibleWidth(lead + title)));
		const node = r.currentNode;
		const stateLabel = r.paused
			? "PAUSED"
			: r.awaitingManual
				? "WAITING FOR YOU"
				: node
					? `RUNNING ${node.kind.toUpperCase()}`
					: "RUNNING";
		const uniqueDone = new Set(s.history.map((h) => h.node)).size;
		const lines = [
			theme.fg("border", `╭${lead}`) + theme.fg("accent", theme.bold(title)) + theme.fg("border", `${tailBar}╮`),
			line(theme.fg("text", `${s.graph.title}`) + theme.fg("muted", `  (${s.graph.id})`)),
			line(theme.fg(r.paused ? "warning" : "accent", `State: ${stateLabel}`) + theme.fg("muted", ` · step ${s.steps} · elapsed ${formatElapsed(Date.now() - s.startedAt)}`)),
			line(
				theme.fg("muted", "Node: ") +
					(node ? theme.fg("accent", node.id) + theme.fg("text", ` · ${node.title}`) : theme.fg("dim", "—")),
			),
			line(theme.fg("muted", `Visited ${uniqueDone}/${s.graph.nodes.length} nodes`)),
		];
		if (r.lastOutcomeLine) lines.push(line(theme.fg("muted", `last: ${r.lastOutcomeLine}`)));
		lines.push(theme.fg("border", `╰${"─".repeat(width - 2)}╯`));
		ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
	}

	// ── Emit helpers ────────────────────────────────────────────────

	private send(content: string, details: WorkflowStreamDetails): void {
		this.pi.sendMessage({ customType: WORKFLOW_MSG_TYPE, content, display: true, details });
	}

	private emitHeader(node: WorkflowNode, visit: number): void {
		const bar = "━".repeat(8);
		this.send(`${bar} ${node.id} · ${node.title} [${node.kind}${visit > 1 ? ` · visit ${visit}` : ""}] ${bar}`, { kind: "header" });
	}

	private emitTool(text: string): void {
		this.send(text, { kind: "tool" });
	}

	private emitAssistant(text: string): void {
		this.send(text, { kind: "assistant" });
	}

	private emitAsk(text: string): void {
		this.send(text, { kind: "ask" });
	}

	private emitOutcome(node: WorkflowNode, label: string, reason: string): void {
		const positive = !FAILURE_ALIASES.includes(label) && !label.startsWith("needs");
		const loop = !positive && node.transitions.some((t) => t.on === label);
		const marker = positive ? "✓" : loop ? "↻" : "✗";
		if (this.run) this.run.lastOutcomeLine = `${node.id} → ${label}`;
		this.send(`${marker} ${node.id} → ${label} — ${truncate(reason, 240)}`, { kind: "outcome", positive, loop });
	}

	private emitOutcomeRaw(text: string, positive: boolean): void {
		this.send(text, { kind: "outcome", positive });
	}

	private emitInfo(text: string): void {
		this.send(`/workflow: ${text}`, { kind: "info" });
	}
}
