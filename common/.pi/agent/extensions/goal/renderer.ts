/**
 * Custom message renderer for /goal stream events.
 *
 * Replaces pi's default purple "[goal-stream]" boxed renderer with the
 * spec's clean inline colored lines (cyan node headers, magenta tool
 * call lines, green/yellow/red verdicts, dim info / assistant prose).
 */

import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { MessageRenderer, MessageRenderOptions } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";

export const GOAL_MSG_TYPE = "goal-stream";

export type GoalStreamKind = "header" | "tool" | "assistant" | "verdict" | "info";

export interface GoalStreamDetails {
	kind: GoalStreamKind;
	/** Verdict colouring needs to know whether the status is the positive edge. */
	positive?: boolean;
	/** "↻" for not_done loop back, "✗" for reject, "✓" for positive. */
	marker?: "✓" | "✗" | "↻";
}

function asString(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c: any) => (c && typeof c === "object" && typeof c.text === "string" ? c.text : ""))
			.join("\n");
	}
	return "";
}

export const goalStreamRenderer: MessageRenderer<GoalStreamDetails> = (
	message,
	_options: MessageRenderOptions,
	theme: Theme,
) => {
	const details = (message.details ?? { kind: "info" }) as GoalStreamDetails;
	const text = asString(message.content);
	const container = new Container();
	container.addChild(new Spacer(1));

	const colorize = (color: Parameters<Theme["fg"]>[0], s: string) => theme.fg(color, s);

	switch (details.kind) {
		case "header": {
			// Spec: cyan bold node header bar.
			//   ━━ Planner ─────────────────────────────────────────────
			container.addChild(new Text(colorize("accent", text), 1, 0));
			break;
		}
		case "tool": {
			// Spec: magenta tool-call line.
			container.addChild(new Text(colorize("toolTitle", text), 1, 0));
			break;
		}
		case "verdict": {
			// Spec: green for positive (done/accept/approved), red for reject,
			// yellow for not_done loop. The orchestrator sets details.marker
			// and details.positive.
			const color: Parameters<Theme["fg"]>[0] = details.positive
				? "success"
				: details.marker === "↻"
					? "warning"
					: "error";
			container.addChild(new Text(colorize(color, text), 1, 0));
			break;
		}
		case "info": {
			container.addChild(new Text(colorize("dim", text), 1, 0));
			break;
		}
		case "assistant":
		default: {
			// Plain assistant prose — readable text color.
			container.addChild(new Text(colorize("text", text), 1, 0));
			break;
		}
	}

	return container as Component;
};
