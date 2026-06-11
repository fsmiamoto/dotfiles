/**
 * Shared helper for running a fresh sub-agent session (planner pass, agent
 * nodes, outcome classifier). Mirrors the /goal extension's session setup:
 * in-memory session manager, stripped resource loader, system prompt override.
 */

import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionEvent,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";

async function makeLoader(systemPrompt: string): Promise<any> {
	const loader: any = new DefaultResourceLoader({
		cwd: process.cwd(),
		agentDir: getAgentDir(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPromptOverride: () => systemPrompt,
	});
	if (typeof loader.reload === "function") await loader.reload();
	return loader;
}

export interface SubAgentOptions {
	ctx: ExtensionContext;
	systemPrompt: string;
	seed: string;
	model: Model<any>;
	/** Allowlisted built-in tool names; undefined = defaults. */
	tools?: string[];
	customTools?: ToolDefinition[];
	noTools?: "builtin";
	onEvent?: (evt: AgentSessionEvent) => void;
	/** Receives the live session (for steer/abort) before prompting starts. */
	onSession?: (session: AgentSession) => void;
}

/** Run a one-shot sub-agent session to completion; returns final assistant text. */
export async function runSubAgent(opts: SubAgentOptions): Promise<string> {
	const customToolNames = (opts.customTools ?? []).map((t) => t.name);
	const allowedTools =
		opts.tools && opts.tools.length > 0 ? [...opts.tools, ...customToolNames] : undefined;

	const result = await createAgentSession({
		cwd: process.cwd(),
		agentDir: getAgentDir(),
		model: opts.model,
		...(opts.noTools ? { noTools: opts.noTools } : { tools: allowedTools }),
		customTools: opts.customTools,
		sessionManager: SessionManager.inMemory(process.cwd()),
		modelRegistry: opts.ctx.modelRegistry,
		resourceLoader: await makeLoader(opts.systemPrompt),
	});
	const session = result.session;
	opts.onSession?.(session);

	let lastAssistantText = "";
	const unsubscribe = session.subscribe((evt: AgentSessionEvent) => {
		if (evt.type === "message_end" && evt.message.role === "assistant") {
			const text = extractAssistantText(evt.message);
			if (text) lastAssistantText = text;
		}
		opts.onEvent?.(evt);
	});

	try {
		await session.prompt(opts.seed);
	} finally {
		unsubscribe();
	}

	if (!lastAssistantText) {
		const fromState = (session.getLastAssistantText?.() ?? "").trim();
		if (fromState) lastAssistantText = fromState;
	}
	try {
		session.dispose();
	} catch {
		// ignore
	}
	return lastAssistantText;
}

export function extractAssistantText(message: any): string {
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

export function resolveModel(registry: ModelRegistry, idPattern: string): Model<any> | undefined {
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
