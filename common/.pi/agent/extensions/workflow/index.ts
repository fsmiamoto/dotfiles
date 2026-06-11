/**
 * /workflow — dynamic, task-specific state machines.
 *
 * UX: `/workflow <objective>` runs a planner pass that designs a workflow
 * graph for THIS task, saves it as JSON + an HTML visualization, and waits
 * for approval. `/workflow approve` hands the graph to a generic engine that
 * can execute any saved workflow. Graphs are reusable: `/workflow run <ref>`.
 *
 * Verbs: <objective> | approve | revise <feedback> | reject | open |
 *        run <path-or-id> | resume | list | status | pause | retry | skip | quit
 */

import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import type { AgentSession, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WorkflowEngine } from "./engine.ts";
import { planWorkflow } from "./planner.ts";
import { parseWorkflowGraph } from "./schema.ts";
import {
	createRunLogger,
	loadState,
	listWorkflows,
	resolveWorkflowPath,
	saveState,
	saveWorkflow,
	type PendingState,
} from "./store.ts";
import { extractAssistantText } from "./subagent.ts";
import { renderWorkflowHtml } from "./viz.ts";
import { WORKFLOW_MSG_TYPE, workflowStreamRenderer, type WorkflowStreamDetails } from "./renderer.ts";

const CONVERSATION_TAIL_LIMIT = 4000;

function captureConversationTail(ctx: ExtensionContext): string {
	try {
		const entries = ctx.sessionManager.getEntries();
		if (!entries || entries.length === 0) return "";
		const lines: string[] = [];
		for (let i = entries.length - 1; i >= 0; i--) {
			const e: any = entries[i];
			if (!e) continue;
			let role: string | undefined;
			let text: string | undefined;
			if (e.type === "message" && e.message) {
				role = e.message.role;
				const content = e.message.content;
				if (typeof content === "string") {
					text = content;
				} else if (Array.isArray(content)) {
					text = content
						.map((p: any) => (p && typeof p === "object" && typeof p.text === "string" ? p.text : ""))
						.filter(Boolean)
						.join("\n");
				}
			}
			if (role && text) {
				lines.unshift(`${role}: ${text.trim()}`);
				if (lines.join("\n").length > CONVERSATION_TAIL_LIMIT) {
					lines.shift();
					break;
				}
			}
		}
		return lines.join("\n").slice(-CONVERSATION_TAIL_LIMIT);
	} catch {
		return "";
	}
}

export default function (pi: ExtensionAPI) {
	let lastCtx: ExtensionContext | undefined;
	let planning = false;
	let planAborted = false;
	let plannerSession: AgentSession | undefined;
	let pending: PendingState | undefined = loadState().pending;

	const engine = new WorkflowEngine(pi, () => lastCtx, () => undefined);

	pi.registerMessageRenderer(WORKFLOW_MSG_TYPE, workflowStreamRenderer);

	const send = (content: string, details: WorkflowStreamDetails = { kind: "info" }) => {
		pi.sendMessage({ customType: WORKFLOW_MSG_TYPE, content, display: true, details });
	};
	const info = (text: string) => send(`/workflow: ${text}`, { kind: "info" });

	function announcePending(p: PendingState): void {
		const lines = [
			`Workflow planned: "${p.graph.title}" — ${p.graph.nodes.length} nodes`,
			...p.graph.nodes.map((n) => `  ${n.id === p.graph.start ? "▶" : "·"} ${n.id} [${n.kind}] ${n.title}`),
			...(p.warnings.length > 0 ? ["", `⚠ ${p.warnings.join("\n⚠ ")}`] : []),
			"",
			`Visualization: file://${p.htmlPath}`,
			`Graph: ${p.workflowPath}`,
			"",
			"Next: /workflow approve · /workflow revise <feedback> · /workflow reject · /workflow open",
		];
		send(lines.join("\n"), { kind: "assistant" });
	}

	function tryOpen(path: string): void {
		if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return;
		try {
			exec(`xdg-open ${JSON.stringify(path)}`, () => undefined);
		} catch {
			// best effort
		}
	}

	async function plan(objective: string, ctx: ExtensionContext, feedback?: string): Promise<void> {
		if (planning) {
			info("already planning. /workflow quit to abort.");
			return;
		}
		if (engine.isRunning()) {
			info("a run is active — finish or /workflow quit it before planning a new workflow.");
			return;
		}
		planning = true;
		planAborted = false;
		const logger = createRunLogger("plan");
		send(`━━━━━━━━ planner ━━━━━━━━`, { kind: "header" });
		info(`planning workflow for: ${objective}`);
		try {
			const result = await planWorkflow({
				objective,
				conversationTail: captureConversationTail(ctx),
				feedback,
				previousGraphJson: feedback && pending ? JSON.stringify(pending.graph, null, 2) : undefined,
				ctx,
				logger,
				onSession: (s) => {
					plannerSession = s;
				},
				onEvent: (evt) => {
					if (evt.type === "tool_execution_start") {
						const args = typeof evt.args === "object" ? JSON.stringify(evt.args) : String(evt.args);
						send(`▸ ${evt.toolName} ${args.length > 160 ? `${args.slice(0, 159)}…` : args}`, { kind: "tool" });
					} else if (evt.type === "message_end" && evt.message.role === "assistant") {
						const text = extractAssistantText(evt.message);
						// Planner output is JSON — don't dump it; show a progress nibble.
						if (text && !text.trimStart().startsWith("{")) send(text, { kind: "assistant" });
					}
				},
			});
			if (planAborted) {
				info("planning aborted.");
				return;
			}
			const html = renderWorkflowHtml(result.graph, result.warnings);
			const paths = saveWorkflow(result.graph, html);
			pending = { graph: result.graph, warnings: result.warnings, ...paths };
			saveState({ ...loadState(), pending });
			announcePending(pending);
			tryOpen(paths.htmlPath);
		} catch (err) {
			if (!planAborted) info(`planning failed: ${(err as Error).message}`);
		} finally {
			planning = false;
			plannerSession = undefined;
		}
	}

	async function startRun(p: PendingState, ctx: ExtensionContext): Promise<void> {
		pending = undefined;
		saveState({ ...loadState(), pending: undefined });
		void engine.start(p.graph, p.workflowPath);
	}

	pi.registerCommand("workflow", {
		description: "Plan a task-specific workflow graph, visualize it for approval, then execute it.",
		handler: async (rawArgs, ctx) => {
			lastCtx = ctx;
			const args = (rawArgs ?? "").trim();
			const verb = args.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
			const rest = args.slice(verb.length).trim();

			switch (verb) {
				case "approve": {
					if (!pending) return info("nothing to approve. Plan first: /workflow <objective>");
					if (engine.isRunning()) return info("a run is already active.");
					info(`approved — executing "${pending.graph.title}".`);
					await startRun(pending, ctx);
					return;
				}
				case "revise": {
					if (!pending) return info("nothing to revise. Plan first: /workflow <objective>");
					if (!rest) return info("usage: /workflow revise <feedback>");
					const objective = pending.graph.objective;
					void plan(objective, ctx, rest);
					return;
				}
				case "reject": {
					if (!pending) return info("nothing to reject.");
					info(`rejected "${pending.graph.title}". Files kept at ${pending.workflowPath}`);
					pending = undefined;
					saveState({ ...loadState(), pending: undefined });
					return;
				}
				case "open": {
					if (!pending) return info("no pending workflow. Plan first.");
					tryOpen(pending.htmlPath);
					return info(`file://${pending.htmlPath}`);
				}
				case "run": {
					if (engine.isRunning()) return info("a run is already active.");
					if (!rest) return info("usage: /workflow run <path-or-id-fragment>");
					const path = resolveWorkflowPath(rest);
					if (!path) return info(`no saved workflow matches "${rest}". Try /workflow list`);
					try {
						const parsed = parseWorkflowGraph(readFileSync(path, "utf-8"));
						info(`running saved workflow "${parsed.graph.title}" from ${path}`);
						void engine.start(parsed.graph, path);
					} catch (err) {
						info(`cannot run ${path}: ${(err as Error).message}`);
					}
					return;
				}
				case "resume": {
					if (engine.isRunning()) return info("a run is already active.");
					const persisted = loadState();
					if (!persisted.active) return info("nothing to resume.");
					info(`resuming "${persisted.active.graph.title}" at node ${persisted.active.currentNodeId}.`);
					void engine.start(persisted.active.graph, persisted.active.workflowPath, persisted.active);
					return;
				}
				case "list": {
					const all = listWorkflows();
					if (all.length === 0) return info("no saved workflows yet.");
					send(
						["Saved workflows:", ...all.slice(-15).map((w) => `  ${w.id}`)].join("\n"),
						{ kind: "assistant" },
					);
					return;
				}
				case "status": {
					if (planning) return info("planning in progress…");
					if (pending) return info(`awaiting approval: "${pending.graph.title}" (${pending.graph.nodes.length} nodes). /workflow approve|revise|reject`);
					return info(engine.statusLine());
				}
				case "pause":
					return engine.isRunning() ? engine.pause() : info("no active run.");
				case "retry":
					return engine.isRunning() ? engine.retry() : info("no active run.");
				case "skip":
					return engine.isRunning() ? engine.skip() : info("no active run.");
				case "quit": {
					if (planning) {
						planAborted = true;
						try {
							await plannerSession?.abort();
						} catch {
							// ignore
						}
						return;
					}
					if (engine.isRunning()) return engine.quit();
					if (pending) {
						pending = undefined;
						saveState({ ...loadState(), pending: undefined });
						return info("pending workflow discarded.");
					}
					return info("nothing to quit.");
				}
			}

			// Default: plan a new workflow for the given objective.
			if (!args) {
				info(
					"usage: /workflow <objective> | approve | revise <feedback> | reject | open | run <ref> | resume | list | status | pause | retry | skip | quit",
				);
				return;
			}
			void plan(args, ctx);
		},
	});

	// Route plain typed text to the planner / engine while active.
	pi.on("input", async (event, ctx) => {
		lastCtx = ctx;
		if (!planning && !engine.isRunning()) return { action: "continue" };
		if (event.source !== "interactive" && event.source !== "extension") return { action: "continue" };
		const text = event.text ?? "";
		const trimmed = text.trim();
		if (!trimmed) return { action: "continue" };
		if (trimmed.startsWith("/")) return { action: "continue" };
		if (planning && plannerSession) {
			try {
				await plannerSession.steer(text);
				info(`steer → planner: ${trimmed.slice(0, 120)}`);
			} catch (err) {
				info(`steer failed: ${(err as Error).message}`);
			}
			return { action: "handled" };
		}
		await engine.steerOrAnswer(text);
		return { action: "handled" };
	});

	pi.on("session_start", async (_evt, ctx) => {
		lastCtx = ctx;
		const persisted = loadState();
		if (persisted.active) {
			info(`an interrupted run of "${persisted.active.graph.title}" exists — /workflow resume to continue it.`);
		}
	});
	pi.on("turn_start", async (_evt, ctx) => {
		lastCtx = ctx;
	});
	pi.on("agent_start", async (_evt, ctx) => {
		lastCtx = ctx;
	});
}
