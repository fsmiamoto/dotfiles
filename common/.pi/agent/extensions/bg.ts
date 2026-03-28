/**
 * Background Processes Extension (bg)
 *
 * Lets the LLM (and the user) start, stop, restart, and inspect long-running
 * background processes — dev servers, watchers, build tools — with log output
 * going to files the LLM can read with its existing tools.
 *
 * Processes survive pi exit (detached + unref). On next session start, they
 * are re-adopted by scanning the registry and checking PIDs.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { spawn, type ChildProcess } from "node:child_process";
import {
	mkdirSync,
	readFileSync,
	writeFileSync,
	openSync,
	closeSync,
	existsSync,
} from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Data types ─────────────────────────────────────────────────────

export interface BgProcess {
	name: string;
	pid: number;
	command: string;
	cwd: string;
	startedAt: number;
	logDir: string;
	status: "running" | "exited" | "errored";
	exitCode?: number | null;
	signal?: string | null;
	adopted?: boolean;
}

/** Fields persisted to registry.json */
interface RegistryEntry {
	name: string;
	pid: number;
	command: string;
	cwd: string;
	startedAt: number;
	logDir: string;
}

// ── Constants ──────────────────────────────────────────────────────

const BG_DIR = path.join(os.homedir(), ".pi", "bg");
const REGISTRY_PATH = path.join(BG_DIR, "registry.json");
const LOGS_DIR = path.join(BG_DIR, "logs");

// ── In-memory state ────────────────────────────────────────────────

const processes: Map<string, BgProcess> = new Map();
const childHandles: Map<string, ChildProcess> = new Map();

// ── Registry read/write ────────────────────────────────────────────

function ensureDirs(): void {
	mkdirSync(BG_DIR, { recursive: true });
	mkdirSync(LOGS_DIR, { recursive: true });
}

function loadRegistry(): RegistryEntry[] {
	try {
		if (!existsSync(REGISTRY_PATH)) return [];
		const raw = readFileSync(REGISTRY_PATH, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch {
		return [];
	}
}

function saveRegistry(): void {
	const entries: RegistryEntry[] = [];
	for (const proc of processes.values()) {
		if (proc.status === "running") {
			entries.push({
				name: proc.name,
				pid: proc.pid,
				command: proc.command,
				cwd: proc.cwd,
				startedAt: proc.startedAt,
				logDir: proc.logDir,
			});
		}
	}
	try {
		writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2), "utf-8");
	} catch {
		// Best-effort — directory might be gone
	}
}

// ── PID check ──────────────────────────────────────────────────────

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

// ── Status emitter ─────────────────────────────────────────────────

let _pi: ExtensionAPI | null = null;

function emitStatus(): void {
	if (!_pi) return;
	const running = [...processes.values()].filter(
		(p) => p.status === "running",
	).length;
	_pi.events.emit("bg:status", { running });
}

// ── Spawn ──────────────────────────────────────────────────────────

function spawnProcess(
	name: string,
	command: string,
	cwd: string,
): BgProcess {
	if (processes.has(name)) {
		const existing = processes.get(name)!;
		if (existing.status === "running") {
			throw new Error(
				`Process "${name}" is already running (PID ${existing.pid}). Stop it first or use a different name.`,
			);
		}
	}

	const logDir = path.join(LOGS_DIR, name);
	mkdirSync(logDir, { recursive: true });

	const stdoutPath = path.join(logDir, "stdout.log");
	const stderrPath = path.join(logDir, "stderr.log");

	const stdoutFd = openSync(stdoutPath, "w");
	const stderrFd = openSync(stderrPath, "w");

	const shell = process.env.SHELL || "/bin/sh";
	let child: ChildProcess;
	try {
		child = spawn(shell, ["-c", command], {
			cwd,
			detached: true,
			stdio: ["ignore", stdoutFd, stderrFd],
			env: { ...process.env },
		});
	} finally {
		closeSync(stdoutFd);
		closeSync(stderrFd);
	}

	if (!child.pid) {
		throw new Error(`Failed to spawn process "${name}" — no PID assigned.`);
	}

	child.on("exit", (code, signal) => {
		const proc = processes.get(name);
		if (proc && proc.pid === child.pid) {
			proc.status = code === 0 ? "exited" : "errored";
			proc.exitCode = code;
			proc.signal = signal ?? undefined;
			saveRegistry();
			emitStatus();
		}
	});

	child.unref();

	const proc: BgProcess = {
		name,
		pid: child.pid,
		command,
		cwd,
		startedAt: Date.now(),
		logDir,
		status: "running",
	};

	processes.set(name, proc);
	childHandles.set(name, child);
	saveRegistry();
	emitStatus();

	return proc;
}

// ── Kill ───────────────────────────────────────────────────────────

function killProcess(name: string): boolean {
	const proc = processes.get(name);
	if (!proc || proc.status !== "running") return false;

	try {
		// Kill the entire process group (negative PID)
		process.kill(-proc.pid, "SIGTERM");
	} catch {
		// Try individual PID if process group kill fails
		try {
			process.kill(proc.pid, "SIGTERM");
		} catch {
			// Already dead
		}
	}

	// Give it 3s then SIGKILL
	const pid = proc.pid;
	setTimeout(() => {
		if (isAlive(pid)) {
			try {
				process.kill(-pid, "SIGKILL");
			} catch {
				try {
					process.kill(pid, "SIGKILL");
				} catch {
					// Already dead
				}
			}
		}
	}, 3000);

	proc.status = "exited";
	childHandles.delete(name);
	saveRegistry();
	emitStatus();
	return true;
}

// ── Kill all ───────────────────────────────────────────────────────

function killAll(): number {
	let killed = 0;
	for (const [name, proc] of processes) {
		if (proc.status === "running") {
			if (killProcess(name)) killed++;
		}
	}
	return killed;
}

// ── Re-adoption ────────────────────────────────────────────────────

function adoptProcesses(): void {
	const entries = loadRegistry();
	processes.clear();
	childHandles.clear();

	for (const entry of entries) {
		if (isAlive(entry.pid)) {
			const proc: BgProcess = {
				...entry,
				status: "running",
				adopted: true,
			};
			processes.set(entry.name, proc);
		}
		// Dead processes are dropped — clean slate
	}
	saveRegistry();
	emitStatus();
}

// ── Get running count ──────────────────────────────────────────────

function getRunningCount(): number {
	return [...processes.values()].filter((p) => p.status === "running").length;
}

// ── Get all processes ──────────────────────────────────────────────

function getAllProcesses(): BgProcess[] {
	return [...processes.values()];
}

// ── Get process by name ────────────────────────────────────────────

function getProcess(name: string): BgProcess | undefined {
	return processes.get(name);
}

// ── Remove stopped process from map ────────────────────────────────

function removeProcess(name: string): boolean {
	const proc = processes.get(name);
	if (!proc) return false;
	if (proc.status === "running") return false;
	processes.delete(name);
	childHandles.delete(name);
	return true;
}

// ── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLogDir(logDir: string): string {
	return logDir.replace(os.homedir(), "~");
}

// ── Refresh all PID statuses ───────────────────────────────────────

function refreshStatuses(): void {
	let changed = false;
	for (const proc of processes.values()) {
		if (proc.status === "running" && !isAlive(proc.pid)) {
			proc.status = "exited";
			changed = true;
		}
	}
	if (changed) {
		saveRegistry();
		emitStatus();
	}
}

// ── /bg TUI component ─────────────────────────────────────────────

function formatElapsed(startedAt: number): string {
	const seconds = Math.floor((Date.now() - startedAt) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

class BgListComponent {
	private selected: number = 0;
	private items: BgProcess[];
	private theme: Theme;
	private onClose: () => void;
	private tui: { requestRender: () => void };
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		tui: { requestRender: () => void },
		theme: Theme,
		onClose: () => void,
	) {
		this.tui = tui;
		this.theme = theme;
		this.onClose = onClose;
		this.items = getAllProcesses();
	}

	private refresh(): void {
		refreshStatuses();
		this.items = getAllProcesses();
		if (this.selected >= this.items.length) {
			this.selected = Math.max(0, this.items.length - 1);
		}
		this.invalidate();
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q" || data === "Q") {
			this.onClose();
			return;
		}

		if (this.items.length === 0) return;

		if (matchesKey(data, "up") || data === "k" || data === "K") {
			if (this.selected > 0) {
				this.selected--;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, "down") || data === "j" || data === "J") {
			if (this.selected < this.items.length - 1) {
				this.selected++;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		// Stop selected process
		if (data === "s" || data === "S") {
			const proc = this.items[this.selected];
			if (proc && proc.status === "running") {
				killProcess(proc.name);
				this.refresh();
			}
			return;
		}

		// Clear all dead processes
		if (data === "c" || data === "C") {
			const deadNames = this.items
				.filter((p) => p.status !== "running")
				.map((p) => p.name);
			for (const name of deadNames) {
				removeProcess(name);
			}
			this.refresh();
			return;
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const th = this.theme;
		const lines: string[] = [];

		lines.push("");

		// Header
		const title = th.fg("accent", " Background Processes ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) +
			title +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - 27)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.items.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No background processes")}`, width));
			lines.push("");
			lines.push(
				truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width),
			);
			lines.push("");
			this.cachedWidth = width;
			this.cachedLines = lines;
			return lines;
		}

		// Process rows
		for (let i = 0; i < this.items.length; i++) {
			const proc = this.items[i];
			const isSelected = i === this.selected;
			const prefix = isSelected ? th.fg("accent", "▸ ") : "  ";

			// Status icon
			let icon: string;
			if (proc.status === "running") {
				icon = th.fg("success", "●");
			} else if (proc.status === "errored") {
				icon = th.fg("error", "✗");
			} else {
				icon = th.fg("dim", "✗");
			}

			// Name (highlighted when selected)
			const name = isSelected
				? th.fg("text", th.bold(proc.name))
				: th.fg("text", proc.name);

			// PID
			const pid = th.fg("dim", `PID ${proc.pid}`);

			// Command (truncated)
			const maxCmdLen = Math.max(10, width - 50);
			const cmd = proc.command.length > maxCmdLen
				? proc.command.substring(0, maxCmdLen - 1) + "…"
				: proc.command;
			const cmdText = th.fg("muted", cmd);

			// Time/status info
			let info: string;
			if (proc.status === "running") {
				info = th.fg("dim", formatElapsed(proc.startedAt));
			} else if (proc.exitCode !== null && proc.exitCode !== undefined) {
				info = th.fg("dim", `exited (${proc.exitCode})`);
			} else if (proc.signal) {
				info = th.fg("dim", `killed (${proc.signal})`);
			} else {
				info = th.fg("dim", "exited");
			}

			const row = `${prefix}${icon} ${name}  ${pid}  ${cmdText}  ${info}`;
			lines.push(truncateToWidth(row, width));
		}

		lines.push("");

		// Summary
		const running = this.items.filter((p) => p.status === "running").length;
		const exited = this.items.length - running;
		const parts: string[] = [];
		if (running > 0) parts.push(`${running} running`);
		if (exited > 0) parts.push(`${exited} exited`);
		lines.push(truncateToWidth(`  ${th.fg("muted", parts.join(", "))}`, width));

		lines.push("");

		// Keybinding hints
		const hints = [
			`${th.fg("dim", "↑↓")} ${th.fg("muted", "navigate")}`,
			`${th.fg("dim", "s")} ${th.fg("muted", "stop")}`,
			`${th.fg("dim", "c")} ${th.fg("muted", "clear dead")}`,
			`${th.fg("dim", "q/Esc")} ${th.fg("muted", "close")}`,
		];
		lines.push(truncateToWidth(`  ${hints.join("  ")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ── Extension entry point ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	_pi = pi;

	pi.on("session_start", async (_event, _ctx) => {
		ensureDirs();
		adoptProcesses();
	});

	// ── Shutdown handler ─────────────────────────────────────────────

	pi.on("session_shutdown", async (_event, ctx) => {
		refreshStatuses();
		const running = [...processes.values()].filter(
			(p) => p.status === "running",
		);

		if (running.length === 0) return;

		if (ctx.hasUI) {
			const names = running.map((p) => p.name).join(", ");
			const choice = await ctx.ui.select(
				`${running.length} background process${running.length > 1 ? "es" : ""} still running (${names})`,
				["Kill all and exit", "Leave running"],
			);

			if (choice === "Kill all and exit") {
				killAll();
				// Brief wait for SIGTERM to take effect
				await sleep(500);
			}
		}

		// Always save final state (registry reflects what's still alive)
		saveRegistry();
	});

	// ── /bg command ──────────────────────────────────────────────────

	pi.registerCommand("bg", {
		description: "Show and manage background processes",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/bg requires interactive mode", "error");
				return;
			}

			refreshStatuses();

			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				return new BgListComponent(tui, theme, () => done());
			});
		},
	});

	// ── bg_start ─────────────────────────────────────────────────────

	pi.registerTool({
		name: "bg_start",
		label: "Background Start",
		description:
			"Start a long-running background process (dev server, watcher, build tool). Logs go to files you can read with `read` or `bash tail`.",
		promptSnippet: "Start a background process by name and command",
		promptGuidelines: [
			"Use bg_start for dev servers, watchers, and other long-running processes instead of bash.",
			"Always give processes meaningful names like 'dev-server' or 'build-watch'.",
			"After starting, check logs with read or bash tail to verify it's working.",
		],
		parameters: Type.Object({
			name: Type.String({
				description: "Process name (used as identifier and log directory)",
			}),
			command: Type.String({ description: "Shell command to run" }),
			cwd: Type.Optional(
				Type.String({ description: "Working directory (defaults to current)" }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const name = params.name;
			const command = params.command;
			const cwd = params.cwd || ctx.cwd;

			// If name exists but is dead, clean it up so we can reuse
			const existing = getProcess(name);
			if (existing && existing.status !== "running") {
				removeProcess(name);
			}

			let proc: BgProcess;
			try {
				proc = spawnProcess(name, command, cwd);
			} catch (err: any) {
				throw new Error(err.message);
			}

			// Wait 200ms then check if process crashed immediately
			await sleep(200);
			if (!isAlive(proc.pid)) {
				proc.status = "errored";
				saveRegistry();
				emitStatus();
				const logDir = formatLogDir(proc.logDir);
				throw new Error(
					`Process "${name}" exited immediately after start.\n` +
						`  Check logs:\n` +
						`  stdout: ${logDir}/stdout.log\n` +
						`  stderr: ${logDir}/stderr.log`,
				);
			}

			const logDir = formatLogDir(proc.logDir);
			return {
				content: [
					{
						type: "text",
						text:
							`Started "${name}" (PID ${proc.pid})\n` +
							`  stdout: ${logDir}/stdout.log\n` +
							`  stderr: ${logDir}/stderr.log\n` +
							`Use \`read\` or \`bash\` to inspect logs.`,
					},
				],
				details: {
					name: proc.name,
					pid: proc.pid,
					status: proc.status,
					command: proc.command,
					cwd: proc.cwd,
					logDir: proc.logDir,
				},
			};
		},

		renderCall(args, theme, _context) {
			const text =
				(_context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			let content = theme.fg("toolTitle", theme.bold("bg_start "));
			content += theme.fg("accent", args.name || "");
			if (args.command) {
				content += " " + theme.fg("dim", `"${args.command}"`);
			}
			text.setText(content);
			return text;
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as
				| { name: string; pid: number; status: string; command: string; logDir: string }
				| undefined;

			if (result.isError) {
				const errText = result.content[0];
				return new Text(
					theme.fg("error", "✗ ") +
						theme.fg("muted", errText?.type === "text" ? errText.text : "Failed"),
					0,
					0,
				);
			}

			if (!details) {
				const raw = result.content[0];
				return new Text(raw?.type === "text" ? raw.text : "", 0, 0);
			}

			let text =
				theme.fg("success", "● ") +
				theme.fg("text", details.name) +
				theme.fg("dim", ` PID ${details.pid}`);

			if (expanded) {
				text += "\n  " + theme.fg("dim", `cmd: ${details.command}`);
				text += "\n  " + theme.fg("dim", `logs: ${formatLogDir(details.logDir)}/`);
			}

			return new Text(text, 0, 0);
		},
	});

	// ── bg_stop ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "bg_stop",
		label: "Background Stop",
		description: "Stop a running background process by name.",
		promptSnippet: "Stop a background process by name",
		parameters: Type.Object({
			name: Type.String({ description: "Process name to stop" }),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const name = params.name;
			const proc = getProcess(name);

			if (!proc) {
				throw new Error(`No process named "${name}" found.`);
			}

			if (proc.status !== "running") {
				return {
					content: [
						{
							type: "text",
							text: `Process "${name}" already ${proc.status} (PID ${proc.pid}).`,
						},
					],
					details: {
						name: proc.name,
						pid: proc.pid,
						status: proc.status,
						exitCode: proc.exitCode,
					},
				};
			}

			const killed = killProcess(name);
			if (!killed) {
				throw new Error(`Failed to stop "${name}".`);
			}

			return {
				content: [
					{
						type: "text",
						text: `Stopped "${name}" (PID ${proc.pid}).`,
					},
				],
				details: {
					name: proc.name,
					pid: proc.pid,
					status: "exited",
				},
			};
		},

		renderCall(args, theme, _context) {
			const text =
				(_context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(
				theme.fg("toolTitle", theme.bold("bg_stop ")) +
					theme.fg("accent", args.name || ""),
			);
			return text;
		},

		renderResult(result, _options, theme, _context) {
			if (result.isError) {
				const errText = result.content[0];
				return new Text(
					theme.fg("error", "✗ ") +
						theme.fg("muted", errText?.type === "text" ? errText.text : "Failed"),
					0,
					0,
				);
			}
			const details = result.details as
				| { name: string; pid: number; status: string }
				| undefined;
			if (!details) {
				const raw = result.content[0];
				return new Text(raw?.type === "text" ? raw.text : "", 0, 0);
			}

			if (details.status === "exited" || details.status === "errored") {
				return new Text(
					theme.fg("success", "✓ ") +
						theme.fg("muted", `Stopped "${details.name}" (PID ${details.pid})`),
					0,
					0,
				);
			}

			return new Text(
				theme.fg("dim", `"${details.name}" already ${details.status}`),
				0,
				0,
			);
		},
	});

	// ── bg_restart ───────────────────────────────────────────────────

	pi.registerTool({
		name: "bg_restart",
		label: "Background Restart",
		description:
			"Restart a background process. Kills the current instance and re-spawns with the same command and working directory.",
		promptSnippet: "Restart a background process by name",
		parameters: Type.Object({
			name: Type.String({ description: "Process name to restart" }),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const name = params.name;
			const proc = getProcess(name);

			if (!proc) {
				throw new Error(
					`No process named "${name}" found. Cannot restart a process that was never started.`,
				);
			}

			const command = proc.command;
			const cwd = proc.cwd;

			// Kill if still running
			if (proc.status === "running") {
				killProcess(name);
				// Brief wait for clean shutdown
				await sleep(500);
			}

			// Remove old entry
			removeProcess(name);

			// Re-spawn
			let newProc: BgProcess;
			try {
				newProc = spawnProcess(name, command, cwd);
			} catch (err: any) {
				throw new Error(`Failed to restart "${name}": ${err.message}`);
			}

			// Wait 200ms then check if process crashed immediately
			await sleep(200);
			if (!isAlive(newProc.pid)) {
				newProc.status = "errored";
				saveRegistry();
				emitStatus();
				const logDir = formatLogDir(newProc.logDir);
				throw new Error(
					`Restarted "${name}" but it exited immediately.\n` +
						`  Check logs:\n` +
						`  stdout: ${logDir}/stdout.log\n` +
						`  stderr: ${logDir}/stderr.log`,
				);
			}

			const logDir = formatLogDir(newProc.logDir);
			return {
				content: [
					{
						type: "text",
						text:
							`Restarted "${name}" (new PID ${newProc.pid})\n` +
							`  stdout: ${logDir}/stdout.log\n` +
							`  stderr: ${logDir}/stderr.log\n` +
							`Use \`read\` or \`bash\` to inspect logs.`,
					},
				],
				details: {
					name: newProc.name,
					pid: newProc.pid,
					status: newProc.status,
					command: newProc.command,
					cwd: newProc.cwd,
					logDir: newProc.logDir,
				},
			};
		},

		renderCall(args, theme, _context) {
			const text =
				(_context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(
				theme.fg("toolTitle", theme.bold("bg_restart ")) +
					theme.fg("accent", args.name || ""),
			);
			return text;
		},

		renderResult(result, { expanded }, theme, _context) {
			if (result.isError) {
				const errText = result.content[0];
				return new Text(
					theme.fg("error", "✗ ") +
						theme.fg("muted", errText?.type === "text" ? errText.text : "Failed"),
					0,
					0,
				);
			}

			const details = result.details as
				| { name: string; pid: number; status: string; command: string; logDir: string }
				| undefined;
			if (!details) {
				const raw = result.content[0];
				return new Text(raw?.type === "text" ? raw.text : "", 0, 0);
			}

			let text =
				theme.fg("success", "● ") +
				theme.fg("text", `Restarted ${details.name}`) +
				theme.fg("dim", ` PID ${details.pid}`);

			if (expanded) {
				text += "\n  " + theme.fg("dim", `cmd: ${details.command}`);
				text += "\n  " + theme.fg("dim", `logs: ${formatLogDir(details.logDir)}/`);
			}

			return new Text(text, 0, 0);
		},
	});

	// ── bg_list ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "bg_list",
		label: "Background List",
		description:
			"List all background processes (running and recently exited) with their status and log file paths.",
		promptSnippet: "List all background processes and their status",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			refreshStatuses();
			const all = getAllProcesses();

			if (all.length === 0) {
				return {
					content: [{ type: "text", text: "No background processes." }],
					details: { processes: [], running: 0, exited: 0 },
				};
			}

			const running = all.filter((p) => p.status === "running").length;
			const exited = all.length - running;

			const lines = ["Background processes:"];
			for (const proc of all) {
				const icon = proc.status === "running" ? "●" : "✗";
				const status = proc.status.padEnd(7);
				const logDir = formatLogDir(proc.logDir);
				lines.push(
					`  ${icon} ${proc.name.padEnd(16)} PID ${String(proc.pid).padEnd(8)} ${status}  ${proc.command.substring(0, 40).padEnd(40)}  ${logDir}/`,
				);
			}
			lines.push("");

			const parts: string[] = [];
			if (running > 0) parts.push(`${running} running`);
			if (exited > 0) parts.push(`${exited} exited`);
			lines.push(parts.join(", "));

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: {
					processes: all.map((p) => ({
						name: p.name,
						pid: p.pid,
						status: p.status,
						command: p.command,
						cwd: p.cwd,
						logDir: p.logDir,
						exitCode: p.exitCode,
					})),
					running,
					exited,
				},
			};
		},

		renderCall(_args, theme, _context) {
			return new Text(
				theme.fg("toolTitle", theme.bold("bg_list")),
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as
				| {
						processes: Array<{
							name: string;
							pid: number;
							status: string;
							command: string;
							logDir: string;
						}>;
						running: number;
						exited: number;
				  }
				| undefined;

			if (!details || details.processes.length === 0) {
				return new Text(theme.fg("dim", "No background processes"), 0, 0);
			}

			let text = theme.fg("muted", `${details.running} running, ${details.exited} exited`);

			if (expanded) {
				for (const proc of details.processes) {
					const icon =
						proc.status === "running"
							? theme.fg("success", "●")
							: theme.fg("error", "✗");
					const name = theme.fg("text", proc.name);
					const pid = theme.fg("dim", `PID ${proc.pid}`);
					const cmd = theme.fg("dim", proc.command.substring(0, 50));
					text += `\n  ${icon} ${name}  ${pid}  ${cmd}`;
				}
			} else {
				// Compact: just list names
				const names = details.processes.map((p) => {
					const icon =
						p.status === "running"
							? theme.fg("success", "●")
							: theme.fg("error", "✗");
					return `${icon} ${theme.fg("muted", p.name)}`;
				});
				text += "  " + names.join("  ");
			}

			return new Text(text, 0, 0);
		},
	});
}

// ── Exported for use by other parts of this extension ──────────────

export {
	spawnProcess,
	killProcess,
	killAll,
	getAllProcesses,
	getProcess,
	getRunningCount,
	removeProcess,
	isAlive,
	emitStatus,
	refreshStatuses,
	processes,
	childHandles,
	LOGS_DIR,
	BG_DIR,
	REGISTRY_PATH,
};
