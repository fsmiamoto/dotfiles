/**
 * Loads the four /goal role definitions from
 *   ~/.pi/agent/workflow/{planner,builder,verifier,reviewer}.md
 *
 * Each role is a markdown file with YAML frontmatter:
 *   ---
 *   model: <pattern>
 *   tools: read, bash, edit, ...
 *   ---
 *   <system prompt body>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type RoleName = "planner" | "builder" | "verifier" | "reviewer";

export interface RoleDefinition {
	name: RoleName;
	model: string;
	/** Allowlisted tool names. Empty array means "use defaults". */
	tools: string[];
	systemPrompt: string;
}

interface RoleFrontmatter {
	model?: string;
	tools?: string;
}

function workflowDir(): string {
	return join(getAgentDir(), "workflow");
}

export function loadRole(name: RoleName): RoleDefinition {
	const file = join(workflowDir(), `${name}.md`);
	let raw: string;
	try {
		raw = readFileSync(file, "utf-8");
	} catch (err) {
		throw new Error(`/goal: missing role file ${file}: ${(err as Error).message}`);
	}
	const parsed = parseFrontmatter<RoleFrontmatter>(raw);
	const model = (parsed.frontmatter.model ?? "").trim();
	const toolsRaw = (parsed.frontmatter.tools ?? "").trim();
	const tools = toolsRaw
		? toolsRaw
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0)
		: [];
	return {
		name,
		model,
		tools,
		systemPrompt: parsed.body.trim(),
	};
}

export function loadAllRoles(): Record<RoleName, RoleDefinition> {
	return {
		planner: loadRole("planner"),
		builder: loadRole("builder"),
		verifier: loadRole("verifier"),
		reviewer: loadRole("reviewer"),
	};
}
