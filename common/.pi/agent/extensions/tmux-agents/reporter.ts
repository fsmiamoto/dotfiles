/**
 * tmux-agents reporter: Agent-side extension.
 *
 * Loaded into each spawned agent pi session via `pi -e reporter.ts`.
 * Provides:
 * 1. Visual name indicator in the status bar
 * 2. `report_result` tool for pushing results to the orchestrator via UDS
 *
 * Environment variables (set by the orchestrator at spawn):
 * - PI_AGENT_NAME  — agent identity (e.g., "scout")
 * - PI_AGENT_SOCKET — UDS path (e.g., ~/.pi/tmux-agents/tmux-agents.sock)
 *
 * If either is missing, the extension is a no-op.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import net from "node:net";

const agentName = process.env.PI_AGENT_NAME;
const socketPath = process.env.PI_AGENT_SOCKET;

// ── UDS client ─────────────────────────────────────────────────────

function sendToOrchestrator(msg: Record<string, unknown>): Promise<void> {
	return new Promise((resolve, reject) => {
		const client = net.createConnection(socketPath!, () => {
			client.end(JSON.stringify(msg) + "\n");
		});

		client.on("end", () => resolve());
		client.on("error", (err) => {
			reject(new Error(`Failed to connect to orchestrator: ${err.message}`));
		});

		// Timeout after 5s
		client.setTimeout(5000, () => {
			client.destroy();
			reject(new Error("Timed out connecting to orchestrator"));
		});
	});
}

// ── Extension entry point ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	if (!agentName) return; // not running as a managed agent

	// Visual indicator in the status bar
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus("tmux-agent", `🤖 ${agentName}`);
		// Make agent name visible in process listings and tmux pane title
		process.title = `pi-agent:${agentName}`;
		process.stdout.write(`\x1b]2;🤖 ${agentName}\x07`);
	});

	// report_result tool
	pi.registerTool({
		name: "report_result",
		label: "Report Result",
		description:
			"Report your findings or results back to the orchestrator session. " +
			"Call this when you have completed your task or have significant results to share. " +
			"The orchestrator will receive your report and can act on it.",
		promptSnippet: "Report results back to the parent orchestrator session",
		parameters: Type.Object({
			summary: Type.String({ description: "Brief one-line summary of what was accomplished" }),
			result: Type.String({ description: "Full detailed results, findings, or output" }),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!socketPath) {
				throw new Error("No orchestrator socket configured (PI_AGENT_SOCKET not set)");
			}

			await sendToOrchestrator({
				type: "result",
				name: agentName,
				summary: params.summary,
				result: params.result,
			});

			return {
				content: [{ type: "text" as const, text: `Result reported to orchestrator: ${params.summary}` }],
				details: { summary: params.summary },
			};
		},

		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			let content = theme.fg("toolTitle", theme.bold("report_result "));
			if (args.summary) {
				const preview = args.summary.length > 60 ? args.summary.slice(0, 60) + "…" : args.summary;
				content += theme.fg("dim", preview);
			}
			text.setText(content);
			return text;
		},

		renderResult(result, _options, theme, _context) {
			if (result.isError) {
				return new Text(
					theme.fg("error", "✗ ") + theme.fg("muted", result.content[0]?.text || "Failed"),
					0,
					0,
				);
			}
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Reported to orchestrator"), 0, 0);
		},
	});
}
