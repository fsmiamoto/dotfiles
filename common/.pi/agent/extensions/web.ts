/**
 * Web Search Extension — Search the web and read pages
 *
 * Two tools:
 * - `web_search` — Search the web via DuckDuckGo (no API key needed)
 * - `web_read`   — Fetch a URL and extract readable text content
 *
 * Zero config, zero dependencies beyond built-in fetch.
 *
 * Usage: pi -e extensions/websearch.ts
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ── Types ──────────────────────────────────────────────────────────────

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface SearchDetails {
	query: string;
	results: SearchResult[];
	error?: string;
}

interface ReadDetails {
	url: string;
	title?: string;
	contentLength: number;
	truncated: boolean;
	error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const USER_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SEARCH_MAX_RESULTS = 10;
const READ_MAX_CHARS = 40_000; // ~10k tokens, leaves room in context

// ── HTML helpers ───────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities. */
function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, "/")
		.replace(/&hellip;/g, "…")
		.replace(/&mdash;/g, "—")
		.replace(/&ndash;/g, "–")
		.replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
		.replace(/\s+/g, " ")
		.trim();
}

/** Collapse whitespace into readable text blocks. */
function collapseWhitespace(text: string): string {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n");
}

// ── DuckDuckGo search ──────────────────────────────────────────────────

async function searchDuckDuckGo(
	query: string,
	numResults: number,
	signal?: AbortSignal,
): Promise<SearchResult[]> {
	const resp = await fetch("https://html.duckduckgo.com/html/", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": USER_AGENT,
		},
		body: `q=${encodeURIComponent(query)}`,
		signal,
	});

	if (!resp.ok) {
		throw new Error(`DuckDuckGo returned HTTP ${resp.status}`);
	}

	const html = await resp.text();
	const results: SearchResult[] = [];

	// DuckDuckGo HTML results are in divs with class "result"
	// Each has: .result__a (link), .result__snippet (description)
	const resultBlocks = html.split(/class="result\s/);

	for (let i = 1; i < resultBlocks.length && results.length < numResults; i++) {
		const block = resultBlocks[i];

		// Extract URL from result__a href
		const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
		if (!hrefMatch) continue;

		let url = hrefMatch[1];
		// DDG wraps URLs in a redirect — extract the actual URL
		const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
		if (uddgMatch) {
			url = decodeURIComponent(uddgMatch[1]);
		}

		// Skip DDG internal links
		if (url.startsWith("/") || url.includes("duckduckgo.com")) continue;

		// Extract title from the link text
		const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
		const title = titleMatch ? stripHtml(titleMatch[1]) : url;

		// Extract snippet
		const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:td|a|div|span)>/);
		const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

		if (title && url) {
			results.push({ title, url, snippet });
		}
	}

	return results;
}

// ── Web page reader ────────────────────────────────────────────────────

async function fetchPageText(
	url: string,
	signal?: AbortSignal,
): Promise<{ text: string; title?: string }> {
	const resp = await fetch(url, {
		headers: { "User-Agent": USER_AGENT },
		signal,
		redirect: "follow",
	});

	if (!resp.ok) {
		throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
	}

	const contentType = resp.headers.get("content-type") || "";

	// Non-HTML content — return raw text
	if (!contentType.includes("html")) {
		const text = await resp.text();
		return { text: collapseWhitespace(text) };
	}

	const html = await resp.text();

	// Extract <title>
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = titleMatch ? stripHtml(titleMatch[1]) : undefined;

	// Remove noise elements
	let cleaned = html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<nav[\s\S]*?<\/nav>/gi, "")
		.replace(/<header[\s\S]*?<\/header>/gi, "")
		.replace(/<footer[\s\S]*?<\/footer>/gi, "")
		.replace(/<aside[\s\S]*?<\/aside>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "");

	// Try to extract <main> or <article> if present
	const mainMatch = cleaned.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
	if (mainMatch) {
		cleaned = mainMatch[1];
	}

	// Convert block elements to newlines
	cleaned = cleaned
		.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, "\n")
		.replace(/<\/?(ul|ol|table|thead|tbody|dl)[^>]*>/gi, "\n");

	// Strip remaining tags and clean up
	const text = collapseWhitespace(stripHtml(cleaned));

	return { text, title };
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
	});

	// ── web_search tool ────────────────────────────────────────────────

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Use this to find current information, documentation, APIs, or anything on the web.",
		promptGuidelines: [
			"Use web_search when the user asks about current events, recent releases, or information you're unsure about.",
			"Follow up with web_read to get full content from promising search results.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			num_results: Type.Optional(
				Type.Number({
					description: "Number of results to return (default: 5, max: 10)",
					minimum: 1,
					maximum: 10,
				}),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			const numResults = Math.min(params.num_results ?? 5, SEARCH_MAX_RESULTS);

			onUpdate?.({
				content: [{ type: "text", text: `Searching: "${params.query}"...` }],
			});

			try {
				const results = await searchDuckDuckGo(params.query, numResults, signal);

				if (results.length === 0) {
					return {
						content: [{ type: "text", text: `No results found for "${params.query}"` }],
						details: { query: params.query, results: [], error: "no results" } satisfies SearchDetails,
					};
				}

				const text = results
					.map(
						(r, i) =>
							`${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`,
					)
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: `Found ${results.length} result(s) for "${params.query}":\n\n${text}`,
						},
					],
					details: { query: params.query, results } satisfies SearchDetails,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Search failed: ${message}` }],
					details: {
						query: params.query,
						results: [],
						error: message,
					} satisfies SearchDetails,
					isError: true,
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("web_search "));
			text += theme.fg("accent", `"${args.query}"`);
			if (args.num_results) {
				text += theme.fg("dim", ` (${args.num_results} results)`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as SearchDetails | undefined;

			if (!details || details.error) {
				const errText = details?.error ?? "unknown error";
				return new Text(theme.fg("error", `✕ Search failed: ${errText}`), 0, 0);
			}

			if (details.results.length === 0) {
				return new Text(theme.fg("warning", `No results for "${details.query}"`), 0, 0);
			}

			let text = theme.fg("success", "✓ ") +
				theme.fg("muted", `${details.results.length} result(s) for `) +
				theme.fg("accent", `"${details.query}"`);

			if (expanded) {
				for (const r of details.results) {
					text += "\n  " + theme.fg("success", r.title);
					text += "\n  " + theme.fg("dim", r.url);
					if (r.snippet) {
						text += "\n  " + theme.fg("muted", r.snippet);
					}
					text += "";
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ── web_read tool ──────────────────────────────────────────────────

	pi.registerTool({
		name: "web_read",
		label: "Web Read",
		description:
			"Fetch a web page and extract its readable text content. " +
			"Strips HTML, scripts, styles, and navigation. ",
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch and read" }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			// Normalize leading @ (some models add it)
			const url = params.url.replace(/^@/, "");

			onUpdate?.({
				content: [{ type: "text", text: `Fetching: ${url}...` }],
			});

			try {
				const { text, title } = await fetchPageText(url, signal);

				if (!text || text.length === 0) {
					return {
						content: [{ type: "text", text: `Page at ${url} returned no readable content.` }],
						details: {
							url,
							title,
							contentLength: 0,
							truncated: false,
							error: "empty content",
						} satisfies ReadDetails,
					};
				}

				let content = text;
				let truncated = false;

				if (content.length > READ_MAX_CHARS) {
					content = content.slice(0, READ_MAX_CHARS);
					truncated = true;
				}

				// Also apply line/byte truncation for safety
				const trunc = truncateHead(content, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});

				if (trunc.truncated) {
					content = trunc.content;
					truncated = true;
				}

				let header = "";
				if (title) header += `Title: ${title}\n`;
				header += `URL: ${url}\n`;
				if (truncated) {
					header += `[Content truncated to ${formatSize(content.length)} of ${formatSize(text.length)}]\n`;
				}
				header += "---\n";

				return {
					content: [{ type: "text", text: header + content }],
					details: {
						url,
						title,
						contentLength: text.length,
						truncated,
					} satisfies ReadDetails,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Failed to fetch ${url}: ${message}` }],
					details: {
						url,
						contentLength: 0,
						truncated: false,
						error: message,
					} satisfies ReadDetails,
					isError: true,
				};
			}
		},

		renderCall(args, theme) {
			const url = args.url.replace(/^@/, "");
			let text = theme.fg("toolTitle", theme.bold("web_read "));
			text += theme.fg("accent", url);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as ReadDetails | undefined;

			if (!details || details.error) {
				const errText = details?.error ?? "unknown error";
				return new Text(theme.fg("error", `✕ Fetch failed: ${errText}`), 0, 0);
			}

			let text = theme.fg("success", "✓ ");
			if (details.title) {
				text += theme.fg("accent", details.title) + " ";
			}
			text += theme.fg("dim", `(${formatSize(details.contentLength)})`);
			if (details.truncated) {
				text += theme.fg("warning", " [truncated]");
			}

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					// Show first ~20 lines of content in expanded view
					const lines = content.text.split("\n").slice(0, 20);
					text += "\n" + lines.map((l) => theme.fg("muted", "  " + l)).join("\n");
					const totalLines = content.text.split("\n").length;
					if (totalLines > 20) {
						text += "\n" + theme.fg("dim", `  ... ${totalLines - 20} more lines`);
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
