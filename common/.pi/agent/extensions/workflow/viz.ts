/**
 * Self-contained HTML visualization for a workflow graph.
 *
 * Renders a static SVG state-machine diagram (BFS-layered, back-edges routed
 * along the side), node detail cards, a transitions table, and any validation
 * warnings. No external assets — works offline from the file:// URL.
 */

import type { WorkflowGraph, WorkflowNode } from "./schema.ts";

function esc(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const NODE_W = 200;
const NODE_H = 62;
const H_GAP = 48;
const V_GAP = 78;
const KIND_FILL: Record<string, string> = {
	agent: "var(--agent)",
	manual: "var(--manual)",
	command: "var(--command)",
	terminal: "var(--terminal)",
};

interface Placed {
	node: WorkflowNode;
	layer: number;
	x: number;
	y: number;
}

function layoutLayers(graph: WorkflowGraph): Map<string, Placed> {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const layerOf = new Map<string, number>();
	layerOf.set(graph.start, 0);
	const queue = [graph.start];
	while (queue.length > 0) {
		const id = queue.shift()!;
		const node = byId.get(id)!;
		for (const t of node.transitions) {
			if (!layerOf.has(t.to)) {
				layerOf.set(t.to, layerOf.get(id)! + 1);
				queue.push(t.to);
			}
		}
	}
	let maxLayer = Math.max(0, ...layerOf.values());
	for (const n of graph.nodes) {
		if (!layerOf.has(n.id)) layerOf.set(n.id, ++maxLayer); // unreachable → bottom
	}

	const layers = new Map<number, WorkflowNode[]>();
	for (const n of graph.nodes) {
		const l = layerOf.get(n.id)!;
		if (!layers.has(l)) layers.set(l, []);
		layers.get(l)!.push(n);
	}
	const widest = Math.max(...[...layers.values()].map((row) => row.length));
	const totalW = widest * NODE_W + (widest - 1) * H_GAP;

	const placed = new Map<string, Placed>();
	for (const [layer, row] of layers) {
		const rowW = row.length * NODE_W + (row.length - 1) * H_GAP;
		const startX = (totalW - rowW) / 2;
		row.forEach((node, i) => {
			placed.set(node.id, {
				node,
				layer,
				x: startX + i * (NODE_W + H_GAP),
				y: layer * (NODE_H + V_GAP),
			});
		});
	}
	return placed;
}

function renderSvg(graph: WorkflowGraph): string {
	const placed = layoutLayers(graph);
	const all = [...placed.values()];
	const width = Math.max(...all.map((p) => p.x + NODE_W)) + 80;
	const height = Math.max(...all.map((p) => p.y + NODE_H)) + 30;

	const edges: string[] = [];
	let backEdgeCount = 0;
	for (const from of all) {
		for (const t of from.node.transitions) {
			const to = placed.get(t.to)!;
			const label = esc(t.on);
			if (to.layer > from.layer) {
				// Forward edge: bottom of source → top of target.
				const sx = from.x + NODE_W / 2;
				const sy = from.y + NODE_H;
				const tx = to.x + NODE_W / 2;
				const ty = to.y;
				const my = (sy + ty) / 2;
				edges.push(
					`<path d="M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty - 6}" class="edge" marker-end="url(#arrow)"/>` +
						`<text x="${(sx + tx) / 2}" y="${my - 4}" class="edge-label">${label}</text>`,
				);
			} else {
				// Back or lateral edge: route along the right margin, dashed.
				backEdgeCount += 1;
				const offset = 26 + backEdgeCount * 18;
				const sx = from.x + NODE_W;
				const sy = from.y + NODE_H / 2;
				const tx = to.x + NODE_W;
				const ty = to.y + NODE_H / 2;
				const rail = Math.max(sx, tx) + offset;
				edges.push(
					`<path d="M ${sx} ${sy} C ${rail} ${sy}, ${rail} ${ty}, ${tx + 6} ${ty}" class="edge back" marker-end="url(#arrow)"/>` +
						`<text x="${rail + 4}" y="${(sy + ty) / 2}" class="edge-label back">${label}</text>`,
				);
			}
		}
	}

	const boxes = all.map((p) => {
		const fill = KIND_FILL[p.node.kind] ?? "var(--agent)";
		const startMark =
			p.node.id === graph.start
				? `<circle cx="${p.x + NODE_W / 2}" cy="${p.y - 14}" r="5" class="start-dot"/>` +
					`<line x1="${p.x + NODE_W / 2}" y1="${p.y - 9}" x2="${p.x + NODE_W / 2}" y2="${p.y - 1}" class="edge"/>`
				: "";
		return (
			startMark +
			`<g><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="9" fill="${fill}" class="node-box"/>` +
			`<text x="${p.x + NODE_W / 2}" y="${p.y + 26}" class="node-title">${esc(truncate(p.node.title, 26))}</text>` +
			`<text x="${p.x + NODE_W / 2}" y="${p.y + 45}" class="node-kind">${esc(p.node.id)} · ${p.node.kind}</text></g>`
		);
	});

	return `<svg width="${width + 60}" height="${height + 20}" viewBox="0 0 ${width + 60} ${height + 20}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="workflow graph">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="arrow-head"/></marker></defs>
<g transform="translate(30, 20)">${edges.join("\n")}\n${boxes.join("\n")}</g>
</svg>`;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function renderWorkflowHtml(graph: WorkflowGraph, warnings: string[]): string {
	const edgeCount = graph.nodes.reduce((sum, n) => sum + n.transitions.length, 0);
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));

	const cards = graph.nodes
		.map((n) => {
			const criteria = n.successCriteria.map((c) => `<li>${esc(c)}</li>`).join("");
			const cmd = n.command ? `<p><code>${esc(n.command)}</code></p>` : "";
			return `<article class="node node-${n.kind}">
<code>${esc(n.id)} · ${n.kind}</code>
<h3>${esc(n.title)}</h3>
<p>${esc(n.prompt)}</p>
${cmd}
${criteria ? `<ul>${criteria}</ul>` : ""}
</article>`;
		})
		.join("\n");

	const rows = graph.nodes
		.flatMap((n) =>
			n.transitions.map(
				(t) =>
					`<tr><td>${esc(n.title)}<br><code>${esc(n.id)}</code></td><td><code>${esc(t.on)}</code></td><td>${esc(byId.get(t.to)?.title ?? "?")}<br><code>${esc(t.to)}</code></td></tr>`,
			),
		)
		.join("\n");

	const warningBlock =
		warnings.length > 0
			? `<h2>Warnings</h2><div class="warnings"><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
			: "";

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(graph.title)}</title>
<style>
:root { color-scheme: light dark; --bg: #f7f5ef; --ink: #1c1b18; --muted: #6a6259; --line: #b8ab99; --agent: #dceef4; --manual: #f6e3aa; --command: #ddd9f2; --terminal: #cfe8cf; }
@media (prefers-color-scheme: dark) { :root { --bg: #171717; --ink: #f3eee4; --muted: #b8afa4; --line: #625b52; --agent: #173847; --manual: #4b3a13; --command: #35314d; --terminal: #254129; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
h1 { font-size: clamp(28px, 5vw, 46px); line-height: 1.05; margin: 0 0 10px; }
h2 { font-size: 18px; margin: 32px 0 12px; }
p { margin: 0; color: var(--muted); max-width: 75ch; }
.meta { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
.pill { border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; color: var(--muted); }
.diagram { margin-top: 24px; border: 1px solid var(--line); border-radius: 10px; padding: 16px; overflow-x: auto; }
.diagram svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
.node-box { stroke: var(--line); stroke-width: 1; }
.node-title { text-anchor: middle; font: 600 14px ui-sans-serif, system-ui, sans-serif; fill: var(--ink); }
.node-kind { text-anchor: middle; font: 11px ui-monospace, monospace; fill: var(--muted); }
.edge { fill: none; stroke: var(--line); stroke-width: 1.6; }
.edge.back { stroke-dasharray: 5 4; stroke: #c8861f; }
.edge-label { font: 11px ui-monospace, monospace; fill: var(--muted); text-anchor: middle; }
.edge-label.back { fill: #c8861f; text-anchor: start; }
.arrow-head { fill: var(--line); }
.start-dot { fill: var(--ink); }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); margin-top: 18px; }
.node { border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.node-agent { background: var(--agent); }
.node-manual { background: var(--manual); }
.node-command { background: var(--command); }
.node-terminal { background: var(--terminal); }
.node h3 { margin: 0 0 6px; font-size: 16px; }
.node code { font-size: 12px; color: var(--muted); }
.node ul { padding-left: 18px; margin: 8px 0 0; }
.edges { width: 100%; border-collapse: collapse; margin-top: 12px; }
.edges th, .edges td { border-bottom: 1px solid var(--line); padding: 9px 8px; text-align: left; vertical-align: top; }
.edges th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
.warnings { border-left: 4px solid #c8861f; padding-left: 12px; }
</style>
</head>
<body>
<main>
<h1>${esc(graph.title)}</h1>
<p>${esc(graph.objective)}</p>
<div class="meta">
<span class="pill">id: ${esc(graph.id)}</span>
<span class="pill">start: ${esc(graph.start)}</span>
<span class="pill">${graph.nodes.length} nodes</span>
<span class="pill">${edgeCount} edges</span>
</div>
${warningBlock}
<h2>Graph</h2>
<div class="diagram">${renderSvg(graph)}</div>
<h2>Nodes</h2>
<section class="grid">
${cards}
</section>
<h2>Transitions</h2>
<table class="edges">
<thead><tr><th>From</th><th>On</th><th>To</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</main>
</body>
</html>`;
}
