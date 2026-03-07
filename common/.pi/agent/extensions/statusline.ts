/**
 * Tokyonight Statusline Extension
 *
 * A beautiful statusline inspired by lualine/powerline, styled with
 * tokyonight colors. Shows model, thinking level, turn count, git branch,
 * token usage, and session cost.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function(pi: ExtensionAPI) {
	let turnCount = 0;
	let isStreaming = false;

	// ── Helpers ────────────────────────────────────────────────────────

	/** Format token counts: 1234 → "1.2k", 456 → "456" */
	const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

	/** Thinking level display with icon */
	const thinkingIcon = (level: string): string => {
		const icons: Record<string, string> = {
			off: "○",
			minimal: "◔",
			low: "◑",
			medium: "◕",
			high: "●",
			xhigh: "◉",
		};
		return icons[level] ?? "○";
	};

	/** Build a context usage gauge: [████░░░░] 42% */
	const contextGauge = (
		usage: { tokens: number | null; contextWindow: number; percent: number | null } | undefined,
		theme: any,
	): string => {
		if (!usage || usage.percent === null) {
			return theme.fg("dim", "──");
		}

		const pct = Math.min(usage.percent, 100);
		const barLen = 8;
		const filled = Math.round((pct / 100) * barLen);
		const empty = barLen - filled;

		// Color based on usage level
		const color =
			pct >= 90 ? "error" : pct >= 75 ? "warning" : pct >= 50 ? "warning" : "success";

		const filledChar = "█";
		const emptyChar = "░";

		const bar =
			theme.fg(color, filledChar.repeat(filled)) +
			theme.fg("dim", emptyChar.repeat(empty));

		const label = theme.fg(color, `${Math.round(pct)}%`);
		const tokens = fmt(usage.tokens ?? 0);
		const window = fmt(usage.contextWindow);

		return (
			bar +
			" " +
			label +
			theme.fg("dim", ` ${tokens}/${window}`)
		);
	};

	/** Separator characters */
	const SEP = "│";

	// ── Footer ─────────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		turnCount = 0;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() { },
				render(width: number): string[] {
					// ── Gather data ────────────────────────────────
					let inputTokens = 0;
					let outputTokens = 0;
					let totalCost = 0;

					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							inputTokens += m.usage.input;
							outputTokens += m.usage.output;
							totalCost += m.usage.cost.total;
						}
					}

					const branch = footerData.getGitBranch();
					const modelId = ctx.model?.id ?? "no model";
					const thinkingLevel = pi.getThinkingLevel();
					const currentDir = require("node:path").basename(ctx.cwd);

					// ── Build sections ─────────────────────────────

					const extStatuses = footerData.getExtensionStatuses();
					const vimStatus = extStatuses.get("vim-mode");

					// Left: directory | branch | context gauge
					const dirSection =
						theme.fg("accent", "") + theme.fg("text", currentDir);

					const branchSection = branch
						? theme.fg("warning", ` ${branch}`)
						: "";

					const usage = ctx.getContextUsage();
					const gauge = contextGauge(usage, theme);

					const left =
						" " +
						dirSection +
						theme.fg("dim", ` ${SEP} `) +
						branchSection +
						theme.fg("dim", ` ${SEP} `) +
						gauge;

					// Right: turn + tokens + cost | model | thinking
					const turnLabel = isStreaming
						? theme.fg("warning", `⟳ ${turnCount}`)
						: turnCount > 0
							? theme.fg("muted", `✓ ${turnCount}`)
							: theme.fg("dim", "–");

					const tokenSection =
						theme.fg("muted", `↑${fmt(inputTokens)}`) +
						theme.fg("dim", "/") +
						theme.fg("muted", `↓${fmt(outputTokens)}`);

					const costSection = theme.fg("muted", `$${totalCost.toFixed(3)}`);

					const modelSection =
						theme.fg("accent", " 󰧑 ") + theme.fg("text", modelId);

					const thinkingSection =
						theme.fg("muted", thinkingIcon(thinkingLevel)) +
						" " +
						theme.fg("muted", thinkingLevel);

					const right =
						turnLabel +
						theme.fg("dim", ` ${SEP} `) +
						tokenSection +
						theme.fg("dim", ` ${SEP} `) +
						costSection +
						theme.fg("dim", ` ${SEP} `) +
						modelSection +
						theme.fg("dim", ` ${SEP} `) +
						thinkingSection +
						" ";

					// ── Layout ─────────────────────────────────────
					const leftW = visibleWidth(left);
					const rightW = visibleWidth(right);

					const pad = " ".repeat(Math.max(1, width - leftW - rightW));
					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});

	// ── Event tracking ─────────────────────────────────────────────────

	pi.on("turn_start", async (_event, _ctx) => {
		turnCount++;
		isStreaming = true;
	});

	pi.on("turn_end", async (_event, _ctx) => {
		isStreaming = false;
	});

	pi.on("agent_end", async (_event, _ctx) => {
		isStreaming = false;
	});

	pi.on("session_switch", async (event, _ctx) => {
		if (event.reason === "new") {
			turnCount = 0;
			isStreaming = false;
		}
	});
}
