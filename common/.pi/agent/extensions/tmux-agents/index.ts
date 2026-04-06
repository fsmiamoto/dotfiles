/**
 * tmux-agents: Live Subagent Management via tmux
 *
 * Spawns and manages subagent pi sessions as tmux windows in the current session,
 * with real-time visibility, interactive steering, and result reporting back to
 * the orchestrator via a Unix domain socket.
 *
 * This file is the orchestrator side. See reporter.ts for the agent side.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Text, Container, Spacer, Markdown, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync, rmdirSync, renameSync } from "node:fs";
import net from "node:net";
import * as path from "node:path";
import * as os from "node:os";
import { Type } from "@sinclair/typebox";
import { discoverAgents, type AgentConfig } from "./agents.ts";

// ── Data types ─────────────────────────────────────────────────────

interface TrackedAgent {
	name: string;
	tmuxWindow: string;
	pid: number;
	agentProfile?: string;
	model?: string;
	startedAt: number;
	cwd: string;
	promptFile?: string;
	status: "running" | "exited";
	adopted?: boolean;
}

type RegistryEntry = Omit<TrackedAgent, "status" | "adopted">;

// ── Constants ──────────────────────────────────────────────────────

const AGENTS_DIR = path.join(os.homedir(), ".pi", "tmux-agents");
// Session-scoped: each pi instance gets its own registry + socket
// to prevent cross-session interference and concurrent write corruption.
let sessionRegistryPath = "";
let sessionSocketPath = "";
const REPORTER_PATH = path.join(os.homedir(), ".pi", "agent", "extensions", "tmux-agents", "reporter.ts");

// ── In-memory state ────────────────────────────────────────────────

const agents: Map<string, TrackedAgent> = new Map();
let _pi: ExtensionAPI | null = null;
let _ctx: ExtensionContext | undefined;
let udsServer: net.Server | null = null;

// ── Registry read/write ────────────────────────────────────────────

function ensureDirs(): void {
	mkdirSync(AGENTS_DIR, { recursive: true });
}

function loadRegistryFile(filePath: string): RegistryEntry[] {
	try {
		if (!existsSync(filePath)) return [];
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch {
		return [];
	}
}

function saveRegistry(): void {
	if (!sessionRegistryPath) return;
	const entries: RegistryEntry[] = [];
	for (const agent of agents.values()) {
		if (agent.status === "running") {
			const { status, adopted, ...entry } = agent;
			entries.push(entry);
		}
	}
	try {
		// Atomic write: tmp file + rename prevents corruption
		const tmpPath = sessionRegistryPath + ".tmp";
		writeFileSync(tmpPath, JSON.stringify(entries, null, 2), "utf-8");
		renameSync(tmpPath, sessionRegistryPath);
	} catch (err) {
		console.error("tmux-agents: registry save failed:", err);
	}
}

function emitStatus(): void {
	if (!_pi) return;
	const running = [...agents.values()].filter((a) => a.status === "running").length;
	_pi.events.emit("agents:status", { running, total: agents.size });
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

// ── Tmux helpers ───────────────────────────────────────────────────

function isInTmux(): boolean {
	return !!process.env.TMUX;
}

function tmuxWindowExists(windowName: string): boolean {
	try {
		execSync(`tmux list-windows -F '#{window_name}' | grep -qxF '${shellEscape(windowName)}'`, {
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

function tmuxNewWindow(name: string): void {
	execSync(`tmux new-window -d -n '${shellEscape(name)}'`);
}

function tmuxSendKeys(windowName: string, keys: string): void {
	execSync(`tmux send-keys -t ':${shellEscape(windowName)}' ${shellQuote(keys)} Enter`);
}

function tmuxSendRawKeys(windowName: string, keys: string): void {
	execSync(`tmux send-keys -t ':${shellEscape(windowName)}' ${keys}`);
}

function tmuxCapture(windowName: string, lines: number = 100): string {
	return execSync(`tmux capture-pane -t ':${shellEscape(windowName)}' -p -S -${lines}`, {
		encoding: "utf-8",
	});
}

function tmuxKillWindow(windowName: string): void {
	try {
		execSync(`tmux kill-window -t ':${shellEscape(windowName)}'`, { stdio: "ignore" });
	} catch {
		// Already gone
	}
}

/** Escape single quotes for use inside single-quoted shell strings */
function shellEscape(s: string): string {
	return s.replace(/'/g, "'\\''");
}

/** Quote a string for shell command arguments */
function shellQuote(s: string): string {
	return `'${shellEscape(s)}'`;
}

// ── Refresh agent statuses ─────────────────────────────────────────

function refreshStatuses(): void {
	let changed = false;
	for (const agent of agents.values()) {
		if (agent.status === "running") {
			if (!isAlive(agent.pid) || !tmuxWindowExists(agent.tmuxWindow)) {
				cleanupPromptFile(agent.promptFile);
				agent.status = "exited";
				changed = true;
			}
		}
	}
	// Auto-clean exited agents older than 30 minutes
	const staleThreshold = 30 * 60 * 1000;
	for (const [name, agent] of agents) {
		if (agent.status === "exited" && (Date.now() - agent.startedAt) > staleThreshold) {
			agents.delete(name);
			changed = true;
		}
	}
	if (changed) {
		saveRegistry();
		emitStatus();
	}
}

// ── Agent initialization ───────────────────────────────────────────

/** Load agents on startup: own registry (PID reuse edge case) + orphans from dead sessions */
function initAgents(): void {
	agents.clear();

	// Load own registry (handles PID reuse / warm restart edge case)
	const ownEntries = loadRegistryFile(sessionRegistryPath);
	for (const entry of ownEntries) {
		if (isAlive(entry.pid) && tmuxWindowExists(entry.tmuxWindow)) {
			agents.set(entry.name, { ...entry, status: "running" });
		}
	}

	// Adopt orphaned agents from dead sessions
	adoptOrphans();

	saveRegistry();
	emitStatus();
}

/** Scan for orphaned agents from dead sessions and adopt alive ones */
function adoptOrphans(): TrackedAgent[] {
	const adopted: TrackedAgent[] = [];

	try {
		const files = readdirSync(AGENTS_DIR);
		for (const f of files) {
			let registryPath: string | null = null;

			// Per-session registries from dead PIDs
			const match = f.match(/^registry-(\d+)\.json$/);
			if (match) {
				const ownerPid = parseInt(match[1], 10);
				if (ownerPid === process.pid) continue; // our own
				if (isAlive(ownerPid)) continue; // session still alive
				registryPath = path.join(AGENTS_DIR, f);
			}

			// Legacy registry.json (from before per-session registries)
			if (f === "registry.json") {
				registryPath = path.join(AGENTS_DIR, f);
			}

			if (!registryPath) continue;

			const entries = loadRegistryFile(registryPath);
			for (const entry of entries) {
				if (!agents.has(entry.name) && isAlive(entry.pid) && tmuxWindowExists(entry.tmuxWindow)) {
					const tracked: TrackedAgent = { ...entry, status: "running", adopted: true };
					agents.set(entry.name, tracked);
					adopted.push(tracked);
				}
			}
			// Clean up orphaned registry file
			try { unlinkSync(registryPath); } catch {}
		}
	} catch (err) {
		console.error("tmux-agents: orphan scan failed:", err);
	}

	return adopted;
}

// ── UDS Server ─────────────────────────────────────────────────────

/** Remove leftover sockets from dead pi processes */
function cleanupStaleSockets(): void {
	try {
		const files = readdirSync(AGENTS_DIR);
		for (const f of files) {
			const match = f.match(/^tmux-agents-(\d+)\.sock$/);
			if (match) {
				const pid = parseInt(match[1], 10);
				if (pid !== process.pid && !isAlive(pid)) {
					try { unlinkSync(path.join(AGENTS_DIR, f)); } catch {}
				}
			}
		}
	} catch {}
}

function startUDSServer(): void {
	// Remove own stale socket from previous crash
	try {
		unlinkSync(sessionSocketPath);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}

	udsServer = net.createServer(handleConnection);

	udsServer.on("error", (err) => {
		console.error("tmux-agents UDS server error:", err.message);
	});

	udsServer.listen(sessionSocketPath, () => {
		// Server ready
	});

	udsServer.unref(); // don't prevent pi exit
}

function handleConnection(socket: net.Socket): void {
	let buffer = "";

	socket.on("data", (chunk) => {
		buffer += chunk.toString("utf-8");
		const lines = buffer.split("\n");
		buffer = lines.pop()!;

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const msg = JSON.parse(line);
				handleAgentMessage(msg);
			} catch {
				// Malformed JSON, ignore
			}
		}
	});

	socket.on("end", () => {
		// Process any remaining data in buffer
		if (buffer.trim()) {
			try {
				handleAgentMessage(JSON.parse(buffer));
			} catch {
				// Ignore
			}
		}
	});

	socket.on("error", () => {
		// Client disconnected
	});
}

interface AgentResultMessage {
	type: string;
	name: string;
	summary: string;
	result: string;
}

function handleAgentMessage(msg: AgentResultMessage): void {
	if (!_pi || !_ctx) return;

	if (msg.type === "result") {
		const agent = agents.get(msg.name);
		const profileLabel = agent?.agentProfile ? ` (${agent.agentProfile})` : "";

		_pi.sendMessage(
			{
				customType: "agent-result",
				content: `[Agent ${msg.name}${profileLabel}] ${msg.summary}\n\n${msg.result}`,
				display: true,
				details: {
					agentName: msg.name,
					agentProfile: agent?.agentProfile,
					summary: msg.summary,
					result: msg.result,
				},
			},
			{
				deliverAs: "followUp",
				triggerTurn: true,
			},
		);

		// Auto-close: kill agent window after it reports (short delay for UX)
		if (agent) {
			setTimeout(() => {
				if (tmuxWindowExists(agent.tmuxWindow)) {
					tmuxKillWindow(agent.tmuxWindow);
				}
				cleanupPromptFile(agent.promptFile);
				agent.status = "exited";
				agents.delete(msg.name);
				saveRegistry();
				emitStatus();
			}, 1500);
		} else {
			emitStatus();
		}
	}
}

// ── Getters ────────────────────────────────────────────────────────

function getAllAgents(): TrackedAgent[] {
	return [...agents.values()];
}


// ── Cleanup helper ──────────────────────────────────────────────

function cleanupPromptFile(promptFile?: string): void {
	if (!promptFile) return;
	try {
		unlinkSync(promptFile);
	} catch {
		/* already gone */
	}
	// Try to remove parent tmpdir too
	try {
		rmdirSync(path.dirname(promptFile));
	} catch {
		/* not empty or gone */
	}
}

// ── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

function getPanePid(windowName: string): number {
	const raw = execSync(
		`tmux display-message -t ':${shellEscape(windowName)}' -p '#{pane_pid}'`,
		{ encoding: "utf-8" },
	).trim();
	return parseInt(raw, 10);
}

function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h${remainingMinutes}m ago`;
}

// ── /agents TUI component ──────────────────────────────────────────

class AgentListComponent {
	private selected: number = 0;
	private items: TrackedAgent[];
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
		this.items = getAllAgents();
	}

	private refresh(): void {
		refreshStatuses();
		this.items = getAllAgents();
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

		// Navigate
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

		// Enter: switch to agent's tmux window
		if (matchesKey(data, "return")) {
			const agent = this.items[this.selected];
			if (agent) {
				try {
					execSync(`tmux select-window -t ':${shellEscape(agent.tmuxWindow)}'`);
				} catch {
					// window gone
				}
				this.onClose();
			}
			return;
		}

		// x: stop selected agent
		if (data === "x" || data === "X") {
			const agent = this.items[this.selected];
			if (agent && agent.status === "running") {
				tmuxKillWindow(agent.tmuxWindow);
				cleanupPromptFile(agent.promptFile);
				agent.status = "exited";
				agents.delete(agent.name);
				saveRegistry();
				emitStatus();
				this.refresh();
			}
			return;
		}

		// c: clear exited agents
		if (data === "c" || data === "C") {
			const deadNames = this.items
				.filter((a) => a.status !== "running")
				.map((a) => a.name);
			for (const name of deadNames) {
				agents.delete(name);
			}
			saveRegistry();
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
		const title = th.fg("accent", " tmux Agents ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) +
			title +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - 19)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.items.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No agents running")}`, width));
			lines.push("");
			lines.push(
				truncateToWidth(
					`  ${th.fg("dim", "Spawn agents with agent_spawn or ask the LLM to delegate tasks")}`,
					width,
				),
			);
			lines.push("");
			this.cachedWidth = width;
			this.cachedLines = lines;
			return lines;
		}

		// Agent rows
		for (let i = 0; i < this.items.length; i++) {
			const agent = this.items[i];
			const isSelected = i === this.selected;
			const prefix = isSelected ? th.fg("accent", "▸ ") : "  ";

			// Status icon
			const icon =
				agent.status === "running"
					? th.fg("success", "●")
					: th.fg("dim", "✗");

			// Name
			const name = isSelected
				? th.fg("text", th.bold(agent.name))
				: th.fg("text", agent.name);

			// Profile
			const profile = agent.agentProfile
				? th.fg("muted", ` (${agent.agentProfile})`)
				: "";

			// Model
			const model = agent.model
				? th.fg("dim", ` ${agent.model}`)
				: "";

			// Time info
			const info = th.fg("dim", formatUptime(Date.now() - agent.startedAt));

			// Adopted label
			const adoptedLabel = agent.adopted ? th.fg("warning", " [adopted]") : "";

			const row = `${prefix}${icon} ${name}${profile}${model}${adoptedLabel}  ${info}`;
			lines.push(truncateToWidth(row, width));
		}

		lines.push("");

		// Summary
		const running = this.items.filter((a) => a.status === "running").length;
		const exited = this.items.length - running;
		const parts: string[] = [];
		if (running > 0) parts.push(`${running} running`);
		if (exited > 0) parts.push(`${exited} exited`);
		lines.push(truncateToWidth(`  ${th.fg("muted", parts.join(", "))}`, width));
		lines.push("");

		// Keybinding hints
		const hints = [
			`${th.fg("dim", "↑↓")} ${th.fg("muted", "navigate")}`,
			`${th.fg("dim", "Enter")} ${th.fg("muted", "switch")}`,
			`${th.fg("dim", "x")} ${th.fg("muted", "stop")}`,
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

// ── Result detail interfaces ───────────────────────────────────────

interface SpawnResultDetails { name: string; pid: number; model?: string; thinking?: string; profile?: string; tools?: string[]; }
interface SteerResultDetails { name: string; message: string; }
interface ListResultDetails {
	running: { name: string; pid: number; model?: string; profile?: string; uptime: number; }[];
	exited: string[];
	profiles: { name: string; source: string; description: string; }[];
}
interface StopResultDetails { name: string; }

// ── Shared render helpers ──────────────────────────────────────────

function renderError(result: { isError?: boolean; content: { text?: string }[] }, theme: Theme): Text | null {
	if (!result.isError) return null;
	return new Text(theme.fg("error", "✗ ") + theme.fg("muted", result.content[0]?.text || "Failed"), 0, 0);
}

function renderToolCall(context: { lastComponent?: unknown }, theme: Theme, toolName: string, buildContent: (base: string) => string): Text {
	const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
	text.setText(buildContent(theme.fg("toolTitle", theme.bold(toolName + " "))));
	return text;
}

function requireAgent(name: string): TrackedAgent {
	const agent = agents.get(name);
	if (!agent) {
		const available = [...agents.keys()].join(", ") || "none";
		throw new Error(`Agent "${name}" not found. Active agents: ${available}`);
	}
	return agent;
}

// ── Command builder ────────────────────────────────────────────────

function buildAgentCommand(opts: {
	name: string; socketPath: string; model?: string; thinking?: string;
	tools?: string[]; promptFile?: string;
}): string {
	const invocation = getPiInvocation([]);
	const parts: string[] = [];

	// Environment variables
	parts.push(`PI_AGENT_NAME=${shellQuote(opts.name)}`);
	parts.push(`PI_AGENT_SOCKET=${shellQuote(opts.socketPath)}`);

	// Pi binary + script
	parts.push(shellQuote(invocation.command));
	for (const arg of invocation.args) {
		parts.push(shellQuote(arg));
	}

	// Reporter extension
	parts.push("-e", shellQuote(REPORTER_PATH));

	// Model + thinking
	if (opts.model) {
		parts.push("--model");
		if (opts.thinking) {
			parts.push(shellQuote(`${opts.model}:${opts.thinking}`));
		} else {
			parts.push(shellQuote(opts.model));
		}
	} else if (opts.thinking) {
		parts.push("--thinking", shellQuote(opts.thinking));
	}

	// Tools from agent profile
	if (opts.tools && opts.tools.length > 0) {
		parts.push("--tools", shellQuote(opts.tools.join(",")));
	}

	// System prompt file
	if (opts.promptFile) {
		parts.push("--append-system-prompt", shellQuote(opts.promptFile));
	}

	return parts.join(" ");
}

// ── Extension entry point ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	_pi = pi;

	// ── Message renderer for agent results ─────────────────────────
	pi.registerMessageRenderer("agent-result", (message, { expanded }, theme) => {
		const details = message.details as
			| {
					agentName: string;
					agentProfile?: string;
					summary: string;
					result: string;
			  }
			| undefined;

		if (!details) {
			const content = typeof message.content === "string" ? message.content : "Agent result";
			return new Text(content, 0, 0);
		}

		const profileLabel = details.agentProfile ? ` (${details.agentProfile})` : "";
		const header =
			theme.fg("accent", `📋 Agent ${details.agentName}${profileLabel}: `) +
			theme.fg("text", details.summary);

		if (!expanded) {
			return new Text(header, 0, 0);
		}

		const container = new Container();
		container.addChild(new Text(header, 0, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Markdown(details.result, 0, 0, getMarkdownTheme()));
		return container;
	});

	pi.on("session_start", async (_event, ctx) => {
		_ctx = ctx;
		if (!isInTmux()) {
			return;
		}
		ensureDirs();
		sessionSocketPath = path.join(AGENTS_DIR, `tmux-agents-${process.pid}.sock`);
		sessionRegistryPath = path.join(AGENTS_DIR, `registry-${process.pid}.json`);
		cleanupStaleSockets();
		startUDSServer();
		initAgents();

		// Notify if orphaned agents were adopted
		const adopted = [...agents.values()].filter((a) => a.adopted);
		if (adopted.length > 0) {
			const names = adopted.map((a) => a.name).join(", ");
			ctx.ui.notify(
				`tmux-agents: adopted ${adopted.length} orphaned agent(s): ${names} (use agent_peek — adopted agents cannot auto-report)`,
				"info",
			);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		refreshStatuses();
		const running = [...agents.values()].filter((a) => a.status === "running");

		if (running.length > 0 && ctx.hasUI) {
			const names = running.map((a) => a.adopted ? `${a.name} [adopted]` : a.name).join(", ");
			const choice = await ctx.ui.select(
				`${running.length} tmux agent${running.length > 1 ? "s" : ""} still running (${names})`,
				["Kill all agent windows", "Leave running"],
			);

			if (choice === "Kill all agent windows") {
				for (const agent of running) {
					tmuxKillWindow(agent.tmuxWindow);
					cleanupPromptFile(agent.promptFile);
				}
				agents.clear();
			}
		}

		// Save state, close server
		saveRegistry();
		if (udsServer) {
			await new Promise<void>((resolve) => {
				udsServer!.close(() => resolve());
			});
			udsServer = null;
		}
		try { unlinkSync(sessionSocketPath); } catch {}
		// Remove registry file if no running agents left
		if ([...agents.values()].filter(a => a.status === "running").length === 0) {
			try { unlinkSync(sessionRegistryPath); } catch {}
		}
		_ctx = undefined;
	});

	// ── Agent management tools ──────────────────────────────────

	pi.registerTool({
		name: "agent_spawn",
		label: "Spawn Agent",
		description:
			"Spawn a new pi agent in a tmux window. The agent runs autonomously and can report results back.",
		promptSnippet: "Spawn a subagent pi session in a tmux window for delegated tasks",
		promptGuidelines: [
			"Use agent_spawn to delegate tasks to subagents running in tmux windows.",
			"Use agent profiles (agent parameter) when available — they configure model, tools, and system prompt.",
			"After spawning, the agent works autonomously. It will call report_result when done — the result appears as a message in this conversation.",
			"Do NOT peek or poll agents after spawning. Wait for their report_result to arrive. Constant peeking defeats the purpose of delegation.",
			"Only use agent_peek if an agent has been running unusually long and you suspect it's stuck.",
			"Use agent_steer only when you need to redirect an agent. It interrupts their current work.",
			"Use agent_list to see running agents and available profiles before spawning.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "Unique name for the agent (also tmux window name)" }),
			task: Type.String({ description: "Task to delegate to the agent" }),
			agent: Type.Optional(
				Type.String({ description: "Agent profile name from .md files (e.g., 'scout', 'reviewer')" }),
			),
			model: Type.Optional(
				Type.String({ description: "Model override (default: orchestrator's current model)" }),
			),
			thinking: Type.Optional(Type.String({ description: "Thinking level override" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!isInTmux()) {
				throw new Error("Not in a tmux session. tmux-agents requires tmux.");
			}

			const {
				name,
				task,
				agent: agentProfileName,
				model: modelOverride,
				thinking: thinkingOverride,
			} = params;

			// Validate name format
			if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(name)) {
				throw new Error('Agent name must be 1-50 chars: alphanumeric, hyphens, underscores. Must start with alphanumeric.');
			}

			// Validate name uniqueness
			if (agents.has(name)) {
				throw new Error(`Agent "${name}" already exists. Use agent_stop to remove it first.`);
			}
			if (tmuxWindowExists(name)) {
				throw new Error(`Tmux window "${name}" already exists. Choose a different name.`);
			}

			// Load agent config if specified
			let agentConfig: AgentConfig | undefined;
			if (agentProfileName) {
				const discovery = discoverAgents(ctx.cwd, "both");
				agentConfig = discovery.agents.find((a) => a.name === agentProfileName);
				if (!agentConfig) {
					const available = discovery.agents.map((a) => a.name).join(", ") || "none";
					throw new Error(
						`Agent profile "${agentProfileName}" not found. Available: ${available}`,
					);
				}
			}

			// Determine model and thinking level
			const model = modelOverride ?? agentConfig?.model ?? ctx.model?.id;
			const thinking = thinkingOverride ?? agentConfig?.thinking;

			// Write system prompt to temp file if needed
			let promptFile: string | undefined;
			if (agentConfig?.systemPrompt?.trim()) {
				const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pi-tmux-agents-"));
				const safeName = name.replace(/[^\w.-]+/g, "_");
				promptFile = path.join(tmpDir, `prompt-${safeName}.md`);
				writeFileSync(promptFile, agentConfig.systemPrompt, {
					encoding: "utf-8",
					mode: 0o600,
				});
			}

			// Build pi command
			const cmd = buildAgentCommand({
				name,
				socketPath: sessionSocketPath,
				model,
				thinking,
				tools: agentConfig?.tools,
				promptFile,
			});

			// Create tmux window and send command ('; exit' auto-closes window when pi exits)
			tmuxNewWindow(name);
			tmuxSendKeys(name, cmd + '; exit');

			let pid: number;
			try {
				// Poll for readiness instead of fixed sleep
				const deadline = Date.now() + 15000;
				while (Date.now() < deadline) {
					if (!tmuxWindowExists(name)) {
						throw new Error(`Agent "${name}" failed to start — tmux window exited during boot.`);
					}
					const screen = tmuxCapture(name, 10);
					// Detect pi's input prompt (the > character at start of line)
					if (screen.match(/^>/m)) {
						break;
					}
					await sleep(500);
				}
				if (!tmuxWindowExists(name)) {
					throw new Error(`Agent "${name}" failed to start — tmux window exited during boot.`);
				}

				// Send task
				tmuxSendKeys(name, task);

				// Get pane PID for tracking
				pid = getPanePid(name);

				// Track agent
				const tracked: TrackedAgent = {
					name,
					tmuxWindow: name,
					pid,
					agentProfile: agentProfileName,
					model,
					startedAt: Date.now(),
					cwd: ctx.cwd,
					promptFile,
					status: "running",
				};
				agents.set(name, tracked);
				saveRegistry();
				emitStatus();
			} catch (err) {
				cleanupPromptFile(promptFile);
				try { tmuxKillWindow(name); } catch {}
				throw err;
			}

			// Build result
			const meta: string[] = [];
			if (model) meta.push(`model: ${model}${thinking ? `:${thinking}` : ""}`);
			if (agentConfig?.tools) meta.push(`tools: ${agentConfig.tools.join(",")}`);
			if (agentProfileName) meta.push(`profile: ${agentProfileName}`);

			return {
				content: [
					{
						type: "text" as const,
						text: `Agent "${name}" spawned in tmux window (PID ${pid}).${meta.length ? "\n" + meta.join(", ") : ""}\nTask: ${task}`,
					},
				],
				details: {
					name,
					pid,
					model,
					thinking,
					profile: agentProfileName,
					tools: agentConfig?.tools,
				},
			};
		},

		renderCall(args, theme, context) {
			return renderToolCall(context, theme, "agent_spawn", (base) => {
				let content = base;
				if (args.agent) content += theme.fg("accent", `${args.agent} `);
				if (args.name) content += theme.fg("accent", String(args.name));
				if (args.task) {
					const preview =
						String(args.task).length > 80
							? String(args.task).slice(0, 80) + "…"
							: String(args.task);
					content += "\n  " + theme.fg("dim", preview);
				}
				return content;
			});
		},

		renderResult(result, _options, theme, _context) {
			const error = renderError(result, theme);
			if (error) return error;
			const details = result.details as SpawnResultDetails | undefined;
			if (!details) {
				return new Text(theme.fg("success", "● ") + theme.fg("muted", "Agent spawned"), 0, 0);
			}
			let line =
				theme.fg("success", "● ") +
				theme.fg("accent", details.name) +
				theme.fg("dim", ` (PID ${details.pid})`);
			const meta: string[] = [];
			if (details.model) meta.push(`model: ${details.model}`);
			if (details.tools) meta.push(`tools: ${details.tools.join(",")}`);
			if (meta.length) line += "\n  " + theme.fg("dim", meta.join(", "));
			return new Text(line, 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_peek",
		label: "Peek at Agent",
		description: "Capture the current screen content from an agent's tmux window.",
		promptSnippet: "Capture the screen content of a running agent's tmux window",
		parameters: Type.Object({
			name: Type.String({ description: "Agent name to peek at" }),
			lines: Type.Optional(
				Type.Number({ description: "Number of lines to capture (default: 50)" }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { name, lines = 50 } = params;

			const agent = requireAgent(name);
			let content: string;
			try {
				content = tmuxCapture(agent.tmuxWindow, lines);
			} catch {
				agent.status = "exited";
				saveRegistry();
				emitStatus();
				throw new Error(`Agent "${name}" tmux window no longer exists.`);
			}

			return {
				content: [{ type: "text" as const, text: content }],
				details: { name, lines },
			};
		},

		renderCall(args, theme, context) {
			return renderToolCall(context, theme, "agent_peek", (base) => {
				let content = base + theme.fg("accent", String(args.name || ""));
				if (args.lines) content += theme.fg("dim", ` (${args.lines} lines)`);
				return content;
			});
		},

		renderResult(result, options, theme, _context) {
			const error = renderError(result, theme);
			if (error) return error;
			const captured = result.content[0]?.text || "";
			const lines = captured.split("\n");
			if (!options.expanded) {
				const preview = lines.filter((l) => l.trim()).slice(0, 5).join("\n");
				const remaining = Math.max(0, lines.filter((l) => l.trim()).length - 5);
				let out = theme.fg("dim", preview);
				if (remaining > 0) out += "\n  " + theme.fg("muted", `… ${remaining} more lines`);
				return new Text(out, 0, 0);
			}
			return new Text(theme.fg("dim", captured), 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_steer",
		label: "Steer Agent",
		description:
			"Send a message to a running agent. Sends Escape first to interrupt if busy, then delivers the message.",
		promptSnippet: "Send a steering message to a running agent (interrupts if busy)",
		parameters: Type.Object({
			name: Type.String({ description: "Agent name to steer" }),
			message: Type.String({ description: "Message to send to the agent" }),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { name, message } = params;

			const agent = requireAgent(name);
			try {
				// Send Escape to abort if busy, no-op if idle
				tmuxSendRawKeys(agent.tmuxWindow, "Escape");
				await sleep(500);

				// Send steering message
				tmuxSendKeys(agent.tmuxWindow, message);
			} catch {
				agent.status = "exited";
				saveRegistry();
				emitStatus();
				throw new Error(`Agent "${name}" tmux window no longer exists.`);
			}

			return {
				content: [
					{ type: "text" as const, text: `Message sent to "${name}": ${message}` },
				],
				details: { name, message },
			};
		},

		renderCall(args, theme, context) {
			return renderToolCall(context, theme, "agent_steer", (base) => {
				let content = base + theme.fg("accent", String(args.name || ""));
				if (args.message) {
					const preview =
						String(args.message).length > 60
							? String(args.message).slice(0, 60) + "…"
							: String(args.message);
					content += " " + theme.fg("dim", `"${preview}"`);
				}
				return content;
			});
		},

		renderResult(result, _options, theme, _context) {
			const error = renderError(result, theme);
			if (error) return error;
			const details = result.details as SteerResultDetails | undefined;
			return new Text(
				theme.fg("success", "✓ ") +
					theme.fg("muted", `Message sent to ${details?.name || "agent"}`),
				0,
				0,
			);
		},
	});

	pi.registerTool({
		name: "agent_list",
		label: "List Agents",
		description: "List all running agents and available agent profiles.",
		promptSnippet: "List running agents and available agent profiles",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			refreshStatuses();

			const allTracked = getAllAgents();
			const running = allTracked.filter((a) => a.status === "running");
			const exited = allTracked.filter((a) => a.status === "exited");

			// Discover available profiles
			const discovery = discoverAgents(ctx.cwd, "both");

			let text = "";

			if (running.length > 0) {
				text += "Active agents:\n";
				for (const agent of running) {
					const uptime = formatUptime(Date.now() - agent.startedAt);
					const modelStr = agent.model ? `  model: ${agent.model}` : "";
					const profileStr = agent.agentProfile ? ` (${agent.agentProfile})` : "";
					const adoptedStr = agent.adopted ? " [adopted]" : "";
					text += `  ● ${agent.name}${profileStr}${adoptedStr}  PID ${agent.pid}  running  ${uptime}${modelStr}\n`;
				}
			} else {
				text += "No active agents.\n";
			}

			if (exited.length > 0) {
				text += "\nExited agents:\n";
				for (const agent of exited) {
					text += `  ○ ${agent.name}  (exited)\n`;
				}
			}

			if (discovery.agents.length > 0) {
				text += "\nAvailable agent profiles:\n";
				for (const profile of discovery.agents) {
					text += `  ${profile.name} (${profile.source}): ${profile.description}\n`;
				}
			}

			return {
				content: [{ type: "text" as const, text }],
				details: {
					running: running.map((a) => ({
						name: a.name,
						pid: a.pid,
						model: a.model,
						profile: a.agentProfile,
						uptime: Date.now() - a.startedAt,
					})),
					exited: exited.map((a) => a.name),
					profiles: discovery.agents.map((a) => ({
						name: a.name,
						source: a.source,
						description: a.description,
					})),
				},
			};
		},

		renderCall(_args, theme, context) {
			return renderToolCall(context, theme, "agent_list", (base) => base);
		},

		renderResult(result, options, theme, _context) {
			const error = renderError(result, theme);
			if (error) return error;
			const details = result.details as ListResultDetails | undefined;
			if (!details) {
				return new Text(result.content[0]?.text || "", 0, 0);
			}

			if (!options.expanded) {
				const names = details.running.map((a) => a.name).join(", ");
				return new Text(
					theme.fg("accent", `${details.running.length} running`) +
						(names ? theme.fg("dim", ` (${names})`) : ""),
					0,
					0,
				);
			}

			return new Text(result.content[0]?.text || "", 0, 0);
		},
	});

	pi.registerTool({
		name: "agent_stop",
		label: "Stop Agent",
		description:
			"Stop a running agent. Sends Ctrl+C/Ctrl+D first, then force-kills the tmux window if needed.",
		promptSnippet: "Stop a running agent and clean up its tmux window",
		parameters: Type.Object({
			name: Type.String({ description: "Agent name to stop" }),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { name } = params;

			const agent = requireAgent(name);

			if (tmuxWindowExists(agent.tmuxWindow)) {
				// Graceful shutdown: Ctrl+C then Ctrl+D
				tmuxSendRawKeys(agent.tmuxWindow, "C-c C-c");
				await sleep(1000);
				tmuxSendRawKeys(agent.tmuxWindow, "C-d");
				await sleep(2000);

				// Force kill if still alive
				if (tmuxWindowExists(agent.tmuxWindow)) {
					tmuxKillWindow(agent.tmuxWindow);
				}
			}

			// Clean up temp prompt file
			cleanupPromptFile(agent.promptFile);

			// Remove from registry
			agents.delete(name);
			saveRegistry();
			emitStatus();

			return {
				content: [{ type: "text" as const, text: `Agent "${name}" stopped.` }],
				details: { name },
			};
		},

		renderCall(args, theme, context) {
			return renderToolCall(context, theme, "agent_stop", (base) => {
				return base + theme.fg("accent", String(args.name || ""));
			});
		},

		renderResult(result, _options, theme, _context) {
			const error = renderError(result, theme);
			if (error) return error;
			const details = result.details as StopResultDetails | undefined;
			return new Text(
				theme.fg("success", "✓ ") +
					theme.fg("muted", `Stopped ${details?.name || "agent"}`),
				0,
				0,
			);
		},
	});

	// ── /agents command ──────────────────────────────────────────────

	pi.registerCommand("agents", {
		description: "Show and manage tmux agents",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/agents requires interactive mode", "error");
				return;
			}
			refreshStatuses();
			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				return new AgentListComponent(tui, theme, () => done());
			});
		},
	});
}

export type { TrackedAgent };
