/**
 * Handoff reminder: when context usage crosses a token threshold, inject a
 * one-shot message nudging the model to suggest a /handoff to a fresh session.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readState } from "./go/core.ts";

export function goOwnsHandoff(cwd: string, sessionFile: string | undefined): boolean {
	try {
		const state = readState(cwd, sessionFile);
		return !!state && !!sessionFile && state.sessionFile === sessionFile &&
			(state.status === "running" || state.status === "reviewing");
	} catch {
		return false;
	}
}

const THRESHOLD_TOKENS = 100_000;

const REMINDER = [
	`[handoff-reminder] This session has crossed ${THRESHOLD_TOKENS.toLocaleString()} tokens of context.`,
	"When you finish the current step, suggest to the user that they hand off to a fresh session",
	"via the /handoff prompt (it summarizes context and spawns a new pane). Do not stop mid-task;",
	"just surface the suggestion at a natural boundary. Mention this once, not repeatedly.",
].join(" ");

export default function (pi: ExtensionAPI) {
	let warned = false;

	pi.on("session_start", () => {
		warned = false;
	});

	// After compaction the context is small again; re-arm for the next crossing.
	pi.on("session_compact", () => {
		warned = false;
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (warned) return;
		if (goOwnsHandoff(ctx.cwd, ctx.sessionManager.getSessionFile())) return;
		const usage = ctx.getContextUsage();
		if (!usage || (usage.tokens ?? 0) < THRESHOLD_TOKENS) return;

		warned = true;
		pi.sendMessage(
			{
				customType: "handoff-reminder",
				content: REMINDER,
				display: true,
			},
			{ deliverAs: "steer" },
		);
		if (ctx.hasUI) {
			ctx.ui.notify(
				`Context crossed ${THRESHOLD_TOKENS.toLocaleString()} tokens — model will suggest /handoff`,
				"info",
			);
		}
	});
}
