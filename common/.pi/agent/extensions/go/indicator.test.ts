import assert from "node:assert/strict";
import { test } from "node:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";
import type { GoState } from "./core.ts";

const sdk = process.env.PI_PACKAGE_DIR ?? join(homedir(), ".local/lib/node_modules/@earendil-works/pi-coding-agent");
const require = createRequire(join(sdk, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-tui": require.resolve("@earendil-works/pi-tui") } });
const { renderIndicator } = await jiti.import("./indicator.ts");
const { visibleWidth } = require("@earendil-works/pi-tui");
const theme = { fg: (_color: string, text: string) => `\x1b[36m${text}\x1b[39m`, bold: (text: string) => `\x1b[1m${text}\x1b[22m` };
const state: GoState = { runId: "test", status: "running", steering: "Build a useful goal indicator", sessionFile: "/test", startedAt: "", resets: 0, journalLinesAtLastReset: 0, reviewRounds: 0, tokensUsed: 0, stallResets: 0 };
const render = (patch: Partial<GoState> = {}, plan = "", width = 100) => stripVTControlCharacters(renderIndicator({ ...state, ...patch }, plan, width, theme));

test("every phase names its state and gives the relevant next action", () => {
	for (const [status, name, hint] of [["planning", "planning", "esc pause"], ["running", "running", "esc pause"], ["reviewing", "reviewing", "esc pause"], ["paused", "paused", "/go resume"], ["blocked", "blocked", "/go resume"], ["done", "done", "ready to test"]] as const) {
		const line = render({ status });
		assert.ok(line.startsWith("▎ go ") && line.includes(name));
		assert.ok(line.endsWith(hint));
	}
	assert.match(render({ resetPending: true }), /handing off/);
	assert.match(render({ status: "paused", resetPending: true }), /paused/);
});

test("shows actual checklist count and first unfinished task, ignoring fenced examples", () => {
	const plan = "# Launch plan\n- [x] First\n```md\n- [ ] Example\n````\n~~~\n- [x] Another example\n~~~\n1. [X] Second\n  - [ ] **Ship** the [indicator](./index.ts)\n- [ ] Later";
	const line = render({}, plan);
	assert.match(line, /2\/4\s+Ship the indicator/);
	assert.doesNotMatch(line, /Example|Later/);
	assert.match(render({}, "- [x] Complete"), /1\/1\s+Checklist complete/);
	assert.doesNotMatch(render({}, "# Goal\nNo checklist yet"), /\d\/\d|%/);
});

test("terminal states show reason or completed plan title without stale unfinished tasks", () => {
	const plan = "# Build the widget\n- [ ] Stale task";
	assert.match(render({ status: "blocked", reason: "Need credentials" }, plan), /Need credentials/);
	assert.match(render({ status: "done" }, plan), /Build the widget/);
	assert.doesNotMatch(render({ status: "done" }, plan), /Stale task/);
	assert.match(render({ status: "done", reason: "Ready to test" }, plan), /Build the widget/);
	assert.doesNotMatch(render({ status: "paused", reason: "Interrupted. Use \/go resume. See JOURNAL.md." }, plan), /Use|JOURNAL/);
});

test("planning, handoff, and review explain their work without stale task detail", () => {
	const plan = "# Old plan\n- [x] Prior task\n- [ ] Stale task";
	assert.match(render({ status: "planning" }, plan), /Preparing the plan/);
	assert.doesNotMatch(render({ status: "planning" }, plan), /Old plan|Stale task|1\/2/);
	assert.match(render({ resetPending: true }, plan), /Preparing a fresh session/);
	assert.match(render({ resetPending: true, waitingForSubagents: 2 }, plan), /waiting\s+Waiting for 2 subagent results/);
	assert.match(render({ status: "reviewing" }, plan), /1\/2\s+Checking done criteria/);
});

test("sanitizes terminal controls, OSC links, newlines, and bidi overrides in untrusted text", () => {
	const unsafe = "one\x1b[2J\x1b]8;;https://example.com\x07link\x1b]8;;\x07\n\t\r\u202etwo\u2066";
	const line = render({ status: "blocked", reason: unsafe });
	assert.match(line, /onelink two/);
	assert.doesNotMatch(line, /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
	assert.doesNotMatch(render({}, `- [ ] ${unsafe}`), /\x1b|\u202e|https:/);
});

test("fits every terminal width with ANSI, wide characters and emoji; preserves state/action before details", () => {
	const plan = "# 世界\n- [x] Started\n- [ ] Build 日本語 indicator 👩‍💻 with a very long descriptive task title";
	for (let width = 0; width <= 140; width++) {
		const line = renderIndicator(state, plan, width, theme);
		assert.ok(visibleWidth(line) <= width, `${width}: ${visibleWidth(line)}`);
		assert.doesNotMatch(line, /[\r\n]/);
	}
	const narrow = render({}, plan, 30);
	assert.match(narrow, /running/);
	assert.ok(narrow.endsWith("esc pause"));
	assert.doesNotMatch(narrow, /1\/2|Build/);
	const wide = render({}, plan, 100);
	assert.equal(visibleWidth(wide), 100);
	assert.match(wide, /1\/2\s+Build 日本語 indicator/);
});
