/**
 * Custom message renderer for /workflow stream events — clean inline colored
 * lines (cyan node headers, magenta tool lines, green/yellow/red outcomes,
 * dim info, plain assistant prose). Mirrors the /goal renderer.
 */

import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { MessageRenderer, MessageRenderOptions } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";

export const WORKFLOW_MSG_TYPE = "workflow-stream";

export type WorkflowStreamKind = "header" | "tool" | "assistant" | "outcome" | "info" | "ask";

export interface WorkflowStreamDetails {
	kind: WorkflowStreamKind;
	/** Outcome colouring: true → success-green, false+loop → warning, else error. */
	positive?: boolean;
	loop?: boolean;
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

export const workflowStreamRenderer: MessageRenderer<WorkflowStreamDetails> = (
	message,
	_options: MessageRenderOptions,
	theme: Theme,
) => {
	const details = (message.details ?? { kind: "info" }) as WorkflowStreamDetails;
	const text = asString(message.content);
	const container = new Container();
	container.addChild(new Spacer(1));

	switch (details.kind) {
		case "header":
			container.addChild(new Text(theme.fg("accent", text), 1, 0));
			break;
		case "tool":
			container.addChild(new Text(theme.fg("toolTitle", text), 1, 0));
			break;
		case "outcome": {
			const color = details.positive ? "success" : details.loop ? "warning" : "error";
			container.addChild(new Text(theme.fg(color, text), 1, 0));
			break;
		}
		case "ask":
			container.addChild(new Text(theme.fg("warning", text), 1, 0));
			break;
		case "info":
			container.addChild(new Text(theme.fg("dim", text), 1, 0));
			break;
		default:
			container.addChild(new Text(theme.fg("text", text), 1, 0));
			break;
	}

	return container as Component;
};
