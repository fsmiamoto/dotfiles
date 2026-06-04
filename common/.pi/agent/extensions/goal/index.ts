/**
 * /goal extension entrypoint.
 *
 * Registers the /goal command (start + control verbs) and routes typed
 * text to the active sub-agent's steer() while a run is in progress.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { GoalOrchestrator } from "./orchestrator.ts";
import { GOAL_MSG_TYPE, goalStreamRenderer } from "./renderer.ts";

const CONTROL_VERBS = new Set(["pause", "retry", "skip", "quit", "status"]);
const CONVERSATION_TAIL_LIMIT = 4000; // characters

function captureConversationTail(ctx: ExtensionContext): string {
	try {
		const entries = ctx.sessionManager.getEntries();
		if (!entries || entries.length === 0) return "";
		const lines: string[] = [];
		// Walk backwards and collect compact role:text snippets until limit.
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
						.map((p: any) =>
							p && typeof p === "object" && typeof p.text === "string" ? p.text : "",
						)
						.filter(Boolean)
						.join("\n");
				}
			} else if (e.type === "custom" && typeof e.content === "string") {
				role = "custom";
				text = e.content;
			}
			if (role && text) {
				const snippet = `${role}: ${text.trim()}`;
				lines.unshift(snippet);
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
	const orchestrator = new GoalOrchestrator(pi, () => lastCtx);

	// Replace pi's default "[goal-stream]" purple-boxed renderer with the
	// spec's clean inline colored lines. Registered once at load time.
	pi.registerMessageRenderer(GOAL_MSG_TYPE, goalStreamRenderer);

	pi.registerCommand("goal", {
		description: "Run the Planner→Builder→Verifier→Review→Ready state machine for a goal.",
		handler: async (rawArgs, ctx) => {
			lastCtx = ctx;
			const args = (rawArgs ?? "").trim();
			const firstWord = args.split(/\s+/, 1)[0]?.toLowerCase() ?? "";

			// Control verbs.
			if (CONTROL_VERBS.has(firstWord)) {
				if (!orchestrator.isRunning() && firstWord !== "status") {
					ctx.ui.notify(`/goal ${firstWord}: no active run.`, "warning");
					return;
				}
				switch (firstWord) {
					case "pause":
						await orchestrator.pause();
						return;
					case "retry":
						await orchestrator.retry();
						return;
					case "skip":
						await orchestrator.skip();
						return;
					case "quit":
						await orchestrator.quit();
						return;
					case "status":
						ctx.ui.notify(
							orchestrator.isRunning()
								? "/goal is running. Check the status line."
								: "/goal is idle.",
							"info",
						);
						return;
				}
			}

			// Start path.
			if (orchestrator.isRunning()) {
				ctx.ui.notify(
					"/goal is already running. Type plain text to steer; use /goal pause|retry|skip|quit.",
					"warning",
				);
				return;
			}
			if (!args) {
				ctx.ui.notify("Usage: /goal <what to build> | pause | retry | skip | quit", "warning");
				return;
			}
			const tail = captureConversationTail(ctx);
			// Fire and forget — the orchestrator owns its own lifecycle.
			void orchestrator.start(args, tail);
		},
	});

	// Route plain-typed text to the active sub-session during a run.
	pi.on("input", async (event, ctx) => {
		lastCtx = ctx;
		if (!orchestrator.isRunning()) return { action: "continue" };
		// Only intercept interactive/extension input. Allow RPC through unchanged.
		if (event.source !== "interactive" && event.source !== "extension") {
			return { action: "continue" };
		}
		const text = event.text ?? "";
		const trimmed = text.trim();
		if (!trimmed) return { action: "continue" };
		// Slash commands always pass through (so /goal verbs reach the handler).
		if (trimmed.startsWith("/")) return { action: "continue" };
		// Steer the active node and consume the input so it never reaches the
		// outer agent.
		await orchestrator.steerActive(text);
		return { action: "handled" };
	});

	// Keep ctx reference fresh for command-less event paths.
	pi.on("session_start", async (_evt, ctx) => {
		lastCtx = ctx;
	});
	pi.on("turn_start", async (_evt, ctx) => {
		lastCtx = ctx;
	});
	pi.on("agent_start", async (_evt, ctx) => {
		lastCtx = ctx;
	});
}
