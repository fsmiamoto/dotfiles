import { stripVTControlCharacters } from "node:util";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { GoState } from "./core.ts";

type Color = "accent" | "success" | "warning" | "error" | "muted" | "dim" | "text";
type Theme = { fg(color: Color, text: string): string; bold(text: string): string };

// PLAN and stop reasons are agent-authored: never let them control the terminal.
const clean = (text: string): string => stripVTControlCharacters(text)
	.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ")
	.replace(/\s+/g, " ").trim();
const label = (text: string): string => clean(text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");

function checklist(plan: string) {
	const tasks: { done: boolean; text: string }[] = [];
	let fence: string | undefined;
	let title = "";
	for (const line of plan.split(/\r?\n/)) {
		const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
			continue;
		}
		if (marker) { fence = marker[1]; continue; }
		if (!title && /^#\s+/.test(line)) title = label(line.replace(/^#\s+/, "").replace(/\s+#+\s*$/, ""));
		const task = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/.exec(line);
		if (task) tasks.push({ done: task[1] !== " ", text: label(task[2]) });
	}
	return { tasks, title };
}

/** One quiet, persistent goal row. State and the next action win over task detail. */
export function renderIndicator(state: GoState, plan: string, width: number, theme: Theme): string {
	width = Math.max(0, Math.floor(width));
	if (!width) return "";
	const phase = state.resetPending && (state.status === "running" || state.status === "planning")
		? state.waitingForSubagents ? "waiting" : "handoff" : state.status;
	const phases: Record<typeof phase, { icon: string; name: string; color: Color; hint: string }> = {
		planning: { icon: "◇", name: "planning", color: "accent", hint: "esc pause" },
		running: { icon: "▶", name: "running", color: "success", hint: "esc pause" },
		waiting: { icon: "◇", name: "waiting", color: "warning", hint: "esc pause" },
		handoff: { icon: "↻", name: "handing off", color: "accent", hint: "esc pause" },
		reviewing: { icon: "◎", name: "reviewing", color: "accent", hint: "esc pause" },
		paused: { icon: "Ⅱ", name: "paused", color: "warning", hint: "/go resume" },
		blocked: { icon: "!", name: "blocked", color: "error", hint: "/go resume" },
		done: { icon: "✓", name: "done", color: "success", hint: "ready to test" },
	};
	const { icon, name, color, hint } = phases[phase];
	const { tasks, title } = checklist(plan);
	const completed = tasks.filter(task => task.done).length;
	const current = tasks.find(task => !task.done)?.text;
	const reason = clean(state.reason ?? "").replace(/\s*(?:Use \/go resume\.?|See JOURNAL\.md\.?)/gi, "").trim();
	const detail = phase === "planning" ? "Preparing the plan"
		: phase === "waiting" ? `Waiting for ${state.waitingForSubagents} subagent result${state.waitingForSubagents === 1 ? "" : "s"}`
		: phase === "handoff" ? "Preparing a fresh session"
		: phase === "reviewing" ? "Checking done criteria"
		: phase === "done" ? title || clean(state.steering)
		: phase === "paused" || phase === "blocked" ? reason || title
		: current || (tasks.length ? "Checklist complete" : title || clean(state.steering));
	const head = theme.fg(color, `▎ ${theme.bold("go")} ${icon} ${name}`);
	const action = theme.fg("muted", hint);
	const room = width - visibleWidth(head) - visibleWidth(action) - 3;
	if (room < 0) {
		// Keep both state and action at compact widths, dropping the rail/brand first.
		const compact = theme.fg(color, `${icon} ${name}`);
		const gap = width - visibleWidth(compact) - visibleWidth(action);
		return gap >= 1 ? compact + " ".repeat(gap) + action : truncateToWidth(head, width, "…");
	}
	let middle = "";
	const count = tasks.length && ["running", "reviewing", "done"].includes(phase) ? `${completed}/${tasks.length}` : "";
	// The fraction is honest checklist progress, never a guessed percentage.
	const showCount = count && room >= visibleWidth(count) + (detail ? 10 : 0);
	if (showCount) middle = theme.fg("muted", count);
	const detailRoom = room - visibleWidth(middle) - (middle ? 2 : 0);
	if (detail && detailRoom >= 8) middle += (middle ? "  " : "") + theme.fg("text", truncateToWidth(detail, detailRoom, "…"));
	const left = head + (middle ? "  " + middle : "");
	return left + " ".repeat(width - visibleWidth(left) - visibleWidth(action)) + action;
}
