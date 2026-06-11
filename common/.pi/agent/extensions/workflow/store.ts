/**
 * Persistence for /workflow: saved graphs + HTML under ~/.pi/agent/workflows/,
 * engine/pending state in state.json (crash-safe resume), and an append-only
 * JSONL run log under ~/.pi/agent/workflow-logs/ for benchmarking.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkflowGraph } from "./schema.ts";

const WORKFLOWS_DIR = join(homedir(), ".pi", "agent", "workflows");
const LOG_DIR = join(homedir(), ".pi", "agent", "workflow-logs");
const STATE_PATH = join(WORKFLOWS_DIR, "state.json");

export interface NodeRunRecord {
	node: string;
	kind: string;
	visit: number;
	outcome: string;
	reason: string;
	startedAt: number;
	endedAt: number;
}

export interface EngineState {
	graph: WorkflowGraph;
	workflowPath: string;
	currentNodeId: string;
	steps: number;
	visits: Record<string, number>;
	artifacts: Record<string, string>;
	history: NodeRunRecord[];
	startedAt: number;
}

export interface PendingState {
	graph: WorkflowGraph;
	warnings: string[];
	workflowPath: string;
	htmlPath: string;
}

interface PersistedState {
	pending?: PendingState;
	active?: EngineState;
}

function ensureDirs(): void {
	mkdirSync(WORKFLOWS_DIR, { recursive: true });
	mkdirSync(LOG_DIR, { recursive: true });
}

function timestampSlug(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Write graph JSON + HTML side by side; returns both paths. */
export function saveWorkflow(
	graph: WorkflowGraph,
	html: string,
): { workflowPath: string; htmlPath: string } {
	ensureDirs();
	const base = join(WORKFLOWS_DIR, `${timestampSlug()}-${graph.id}`);
	const workflowPath = `${base}.workflow.json`;
	const htmlPath = `${base}.html`;
	writeFileSync(workflowPath, `${JSON.stringify(graph, null, 2)}\n`, "utf-8");
	writeFileSync(htmlPath, html, "utf-8");
	return { workflowPath, htmlPath };
}

export function listWorkflows(): Array<{ path: string; id: string; mtimeLabel: string }> {
	ensureDirs();
	return readdirSync(WORKFLOWS_DIR)
		.filter((f) => f.endsWith(".workflow.json"))
		.sort()
		.map((f) => ({
			path: join(WORKFLOWS_DIR, f),
			id: f.replace(/\.workflow\.json$/, ""),
			mtimeLabel: f.slice(0, 19),
		}));
}

/** Resolve a user-supplied path or id fragment to a saved workflow file. */
export function resolveWorkflowPath(ref: string): string | undefined {
	if (ref.includes("/")) return ref;
	const all = listWorkflows();
	const matches = all.filter((w) => w.id.includes(ref));
	return matches.at(-1)?.path;
}

export function loadState(): PersistedState {
	try {
		return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as PersistedState;
	} catch {
		return {};
	}
}

export function saveState(state: PersistedState): void {
	try {
		ensureDirs();
		writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
	} catch {
		// persistence must never break a run
	}
}

// ── Run logger (JSONL, used for benchmarking) ────────────────────────

export type LogType =
	| "plan_start"
	| "plan_node_output"
	| "plan_done"
	| "plan_invalid"
	| "run_start"
	| "node_enter"
	| "node_output"
	| "outcome"
	| "edge"
	| "command_exec"
	| "action"
	| "guard"
	| "run_end";

export interface RunLogger {
	logPath: string;
	log(type: LogType, payload?: Record<string, unknown>): void;
}

function truncateValue(value: unknown, max = 4000): unknown {
	if (typeof value !== "string") return value;
	if (value.length <= max) return value;
	return `${value.slice(0, max)}…[${value.length - max} chars truncated]`;
}

export function createRunLogger(label: string): RunLogger {
	ensureDirs();
	const logPath = join(LOG_DIR, `wf-${timestampSlug()}-${label}.jsonl`);
	return {
		logPath,
		log(type, payload = {}) {
			try {
				const sanitized: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(payload)) sanitized[k] = truncateValue(v);
				appendFileSync(logPath, `${JSON.stringify({ type, ts: new Date().toISOString(), ...sanitized })}\n`, "utf-8");
			} catch {
				// never let logging break the run
			}
		},
	};
}
