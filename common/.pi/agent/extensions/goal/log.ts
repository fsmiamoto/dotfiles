/**
 * Append-only JSONL run logger for /goal runs.
 * One file per run at ~/.pi/agent/workflow-logs/<sanitized-ISO>.jsonl.
 * Logging failures must never break the run.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".pi", "agent", "workflow-logs");

export type LogType =
	| "run_start"
	| "node_enter"
	| "node_output"
	| "verdict"
	| "edge"
	| "action"
	| "scratchpad_write"
	| "run_end";

export interface RunLogger {
	logPath: string;
	log(type: LogType, payload?: Record<string, unknown>): void;
	close(): void;
}

function sanitizeFilenameTimestamp(iso: string): string {
	return iso.replace(/[:.]/g, "-");
}

function truncate(value: unknown, max = 4000): unknown {
	if (typeof value !== "string") return value;
	if (value.length <= max) return value;
	return `${value.slice(0, max)}…[${value.length - max} chars truncated]`;
}

export function createRunLogger(): RunLogger {
	try {
		mkdirSync(LOG_DIR, { recursive: true });
	} catch {
		// ignore — log() will swallow errors too
	}
	const iso = new Date().toISOString();
	const logPath = join(LOG_DIR, `${sanitizeFilenameTimestamp(iso)}.jsonl`);

	const log = (type: LogType, payload: Record<string, unknown> = {}): void => {
		try {
			const sanitized: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(payload)) {
				sanitized[k] = typeof v === "string" ? truncate(v) : v;
			}
			const entry = { type, ts: new Date().toISOString(), ...sanitized };
			appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
		} catch {
			// never let logging break the run
		}
	};

	const close = (): void => {
		// no-op; appendFileSync is synchronous and self-closing
	};

	return { logPath, log, close };
}
