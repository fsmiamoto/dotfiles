/**
 * request_feedback — agent-callable bridge to Plannotator's annotate UI.
 *
 * Lets the agent open a document in the Plannotator annotation UI when the
 * user asks for a feedback pass (e.g. "get my feedback on the LLD"). The tool
 * queues the /plannotator-annotate slash command as a follow-up user message;
 * Plannotator opens the browser UI, and the user's annotations come back into
 * the conversation as a user message via Plannotator's own flow.
 *
 * Requires @plannotator/pi-extension to be installed.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "request_feedback",
		label: "Request Feedback",
		description:
			"Open a document in the Plannotator annotation UI so the user can review it and leave inline comments. " +
			"Use when the user asks you to collect their feedback on a markdown/text document (design docs, plans, reports). " +
			"The session is asynchronous: this tool only queues the review — end your turn afterwards and wait. " +
			"The user's annotations arrive later as a user message.",
		parameters: Type.Object({
			filePath: Type.String({
				description:
					"Path to the document to review (markdown/text/config file), relative to the working directory or absolute.",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const raw = params.filePath.replace(/^@/, "");
			const absolutePath = resolve(ctx.cwd, raw);

			if (!existsSync(absolutePath)) {
				throw new Error(`File not found: ${absolutePath}`);
			}
			if (!statSync(absolutePath).isFile()) {
				throw new Error(`Not a file: ${absolutePath}`);
			}
			const hasAnnotate = pi
				.getCommands()
				.some((c) => c.name.startsWith("plannotator-annotate"));
			if (!hasAnnotate) {
				throw new Error(
					"Plannotator extension not available (no /plannotator-annotate command registered).",
				);
			}

			pi.sendUserMessage(`/plannotator-annotate ${absolutePath}`, {
				deliverAs: "followUp",
				expandPromptTemplates: true,
			});

			return {
				content: [
					{
						type: "text",
						text:
							`Queued an annotation session for ${absolutePath}. ` +
							"The Plannotator UI will open once you finish this turn. " +
							"End your turn now; the user's feedback will arrive as a new user message.",
					},
				],
				details: { filePath: absolutePath },
			};
		},
	});
}
