/**
 * Workflow graph schema + validation.
 *
 * A workflow is a task-specific state machine produced by the planner and
 * executed by the generic engine. Stored as `*.workflow.json` under
 * ~/.pi/agent/workflows/ so graphs can be re-run later.
 */

export type NodeKind = "agent" | "command" | "manual" | "terminal";

export interface WorkflowTransition {
	on: string;
	to: string;
}

export interface WorkflowNode {
	id: string;
	title: string;
	kind: NodeKind;
	prompt: string;
	command?: string;
	successCriteria: string[];
	transitions: WorkflowTransition[];
}

export interface WorkflowGraph {
	version: 1;
	id: string;
	title: string;
	objective: string;
	start: string;
	nodes: WorkflowNode[];
}

export interface ValidationResult {
	graph: WorkflowGraph;
	/** Non-fatal issues, surfaced in the HTML and approval message. */
	warnings: string[];
}

const KINDS: NodeKind[] = ["agent", "command", "manual", "terminal"];

function fail(msg: string): never {
	throw new Error(msg);
}

function str(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		fail(`${path} must be a non-empty string`);
	}
	return value.trim();
}

function strArray(value: unknown, path: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) fail(`${path} must be an array of strings`);
	return value.map((v, i) => str(v, `${path}[${i}]`));
}

export function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "workflow"
	);
}

/** Strip an accidental markdown fence around planner JSON output. */
export function stripJsonFence(raw: string): string {
	const trimmed = raw.trim();
	const fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
	return fence ? fence[1] : trimmed;
}

/** Parse + validate planner output into a WorkflowGraph. Throws with a precise message. */
export function parseWorkflowGraph(rawText: string): ValidationResult {
	const raw = stripJsonFence(rawText);
	if (!raw) fail("planner produced empty output");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		fail(`output is not valid JSON: ${(err as Error).message}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		fail("output must be a JSON object");
	}
	const obj = parsed as Record<string, unknown>;
	if (obj.version !== 1) fail("version must be 1");
	const id = slugify(str(obj.id, "id"));
	const title = str(obj.title, "title");
	const objective = str(obj.objective, "objective");
	const start = str(obj.start, "start");
	if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) {
		fail("nodes must be a non-empty array");
	}

	const nodes = obj.nodes.map((item, i): WorkflowNode => {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			fail(`nodes[${i}] must be an object`);
		}
		const n = item as Record<string, unknown>;
		const nodeId = str(n.id, `nodes[${i}].id`);
		const kind = str(n.kind, `nodes[${i}].kind`) as NodeKind;
		if (!KINDS.includes(kind)) {
			fail(`nodes[${i}].kind must be one of ${KINDS.join(", ")} (got "${kind}")`);
		}
		const transitionsRaw = n.transitions === undefined ? [] : n.transitions;
		if (!Array.isArray(transitionsRaw)) fail(`nodes[${i}].transitions must be an array`);
		const transitions = transitionsRaw.map((t, j): WorkflowTransition => {
			if (!t || typeof t !== "object") fail(`nodes[${i}].transitions[${j}] must be an object`);
			const tr = t as Record<string, unknown>;
			return {
				on: str(tr.on, `nodes[${i}].transitions[${j}].on`).toLowerCase(),
				to: str(tr.to, `nodes[${i}].transitions[${j}].to`),
			};
		});
		const node: WorkflowNode = {
			id: nodeId,
			title: str(n.title, `nodes[${i}].title`),
			kind,
			prompt: str(n.prompt, `nodes[${i}].prompt`),
			successCriteria: strArray(n.successCriteria, `nodes[${i}].successCriteria`),
			transitions,
		};
		if (kind === "command") {
			node.command = str(n.command, `nodes[${i}].command`);
		}
		return node;
	});

	// Graph-level checks.
	const byId = new Map<string, WorkflowNode>();
	for (const node of nodes) {
		if (byId.has(node.id)) fail(`duplicate node id "${node.id}"`);
		byId.set(node.id, node);
	}
	if (!byId.has(start)) fail(`start node "${start}" does not exist`);
	for (const node of nodes) {
		const seen = new Set<string>();
		for (const t of node.transitions) {
			if (!byId.has(t.to)) fail(`node "${node.id}" transitions to unknown node "${t.to}"`);
			if (seen.has(t.on)) fail(`node "${node.id}" has duplicate transition label "${t.on}"`);
			seen.add(t.on);
		}
		if (node.kind === "terminal" && node.transitions.length > 0) {
			fail(`terminal node "${node.id}" must have no transitions`);
		}
		if (node.kind !== "terminal" && node.transitions.length === 0) {
			fail(`node "${node.id}" has no transitions but is not kind=terminal`);
		}
	}

	// Reachability + terminal presence.
	const warnings: string[] = [];
	const reachable = new Set<string>([start]);
	const queue = [start];
	while (queue.length > 0) {
		const cur = byId.get(queue.shift()!)!;
		for (const t of cur.transitions) {
			if (!reachable.has(t.to)) {
				reachable.add(t.to);
				queue.push(t.to);
			}
		}
	}
	const unreachable = nodes.filter((n) => !reachable.has(n.id));
	if (unreachable.length > 0) {
		warnings.push(`unreachable nodes (will never run): ${unreachable.map((n) => n.id).join(", ")}`);
	}
	const reachableTerminal = nodes.some((n) => reachable.has(n.id) && n.transitions.length === 0);
	if (!reachableTerminal) fail("no terminal node is reachable from start — the workflow can never finish");

	if (nodes.length > 12) warnings.push(`${nodes.length} nodes is a lot — consider a smaller graph`);

	return { graph: { version: 1, id, title, objective, start, nodes }, warnings };
}
