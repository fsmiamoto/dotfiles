/**
 * Planning pass: a fresh read-only sub-agent turns an objective into a
 * WorkflowGraph (strict JSON), validated with one retry on invalid output.
 * The role definition lives at ~/.pi/agent/workflow/planner.md.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { AgentSession, AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseWorkflowGraph, type ValidationResult } from "./schema.ts";
import { resolveModel, runSubAgent } from "./subagent.ts";
import type { RunLogger } from "./store.ts";

interface PlannerRole {
	model: string;
	tools: string[];
	systemPrompt: string;
}

export function loadPlannerRole(): PlannerRole {
	const file = join(getAgentDir(), "workflow", "planner.md");
	let raw: string;
	try {
		raw = readFileSync(file, "utf-8");
	} catch (err) {
		throw new Error(`/workflow: missing role file ${file}: ${(err as Error).message}`);
	}
	const parsed = parseFrontmatter<{ model?: string; tools?: string }>(raw);
	const toolsRaw = (parsed.frontmatter.tools ?? "").trim();
	return {
		model: (parsed.frontmatter.model ?? "").trim(),
		tools: toolsRaw ? toolsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
		systemPrompt: parsed.body.trim(),
	};
}

export interface PlanRequest {
	objective: string;
	conversationTail: string;
	/** Set when the user asked for changes to a previously planned graph. */
	feedback?: string;
	previousGraphJson?: string;
	ctx: ExtensionContext;
	logger: RunLogger;
	onEvent?: (evt: AgentSessionEvent) => void;
	onSession?: (session: AgentSession) => void;
}

function buildSeed(req: PlanRequest, jsonError?: string): string {
	const lines: string[] = [`# Objective\n${req.objective}\n`];
	if (req.conversationTail) {
		lines.push(`# Recent conversation\n${req.conversationTail}\n`);
	}
	if (req.previousGraphJson) {
		lines.push(`# Previously planned workflow\n${req.previousGraphJson}\n`);
	}
	if (req.feedback) {
		lines.push(`# User feedback on the previous workflow\n${req.feedback}\n\nProduce a revised workflow graph that addresses this feedback.\n`);
	}
	if (jsonError) {
		lines.push(
			`# Previous output was invalid\nError: ${jsonError}\n\nRetry once. Output strict JSON only — no markdown fence, no prose before or after.\n`,
		);
	}
	lines.push(
		"# Your role\nDesign the workflow graph for this objective per your system prompt. Output strict JSON only.",
	);
	return lines.join("\n");
}

/** Run the planner (with one retry on invalid JSON). Throws if both attempts fail. */
export async function planWorkflow(req: PlanRequest): Promise<ValidationResult> {
	const role = loadPlannerRole();
	const modelPattern = role.model || req.ctx.model?.id || "";
	const model = resolveModel(req.ctx.modelRegistry, modelPattern);
	if (!model) throw new Error(`no available model matches '${modelPattern || "default"}'`);

	let lastError = "";
	for (let attempt = 1; attempt <= 2; attempt++) {
		req.logger.log("plan_start", { attempt, objective: req.objective, model: model.id });
		const started = Date.now();
		const finalText = await runSubAgent({
			ctx: req.ctx,
			systemPrompt: role.systemPrompt,
			seed: buildSeed(req, attempt === 1 ? undefined : lastError),
			model,
			tools: role.tools,
			onEvent: req.onEvent,
			onSession: req.onSession,
		});
		req.logger.log("plan_node_output", { attempt, elapsedMs: Date.now() - started, output: finalText });
		try {
			const result = parseWorkflowGraph(finalText);
			req.logger.log("plan_done", {
				attempt,
				id: result.graph.id,
				nodes: result.graph.nodes.length,
				warnings: result.warnings,
			});
			return result;
		} catch (err) {
			lastError = (err as Error).message;
			req.logger.log("plan_invalid", { attempt, error: lastError });
		}
	}
	throw new Error(`planner produced an invalid workflow twice; last error: ${lastError}`);
}
