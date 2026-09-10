// Native Pi TUI regression: node common/.pi/agent/extensions/go/tui.uat.ts
// Requires pi + tmux on PATH. Isolated cwd, offline provider, no paid calls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { goPath, readState } from "./core.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const cwd = mkdtempSync(join(tmpdir(), "pi-go-scoped-tui-"));
const pane = `go-uat-${randomUUID().slice(0, 8)}`;
const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const tmux = (...args: string[]) => execFileSync("tmux", args, { encoding: "utf8" });
const capture = () => tmux("capture-pane", "-t", pane, "-p");
const send = (text: string) => { tmux("send-keys", "-t", pane, "-l", text); tmux("send-keys", "-t", pane, "Enter"); };
async function until(check: () => boolean, label: string) {
  const deadline = Date.now() + 15_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}\n${capture()}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
mkdirSync(join(cwd, "agent"));
mkdirSync(join(cwd, "bin"));
mkdirSync(goPath(cwd, ""), { recursive: true });
writeFileSync(join(cwd, "bin/cmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
writeFileSync(join(cwd, "agent/settings.json"), JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false } }));
const sessionFile = join(cwd, "session-b.jsonl");
writeFileSync(sessionFile, JSON.stringify({ type: "session", version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd }) + "\n");
const legacy = JSON.stringify({ runId: "legacy-a", status: "paused", sessionFile: join(cwd, "session-a.jsonl"),
  startedAt: "2026-01-01T00:00:00.000Z", steering: "Old A", resets: 0, tokensUsed: 0, reviewRounds: 0, stallResets: 0, journalLinesAtLastReset: 0 });
writeFileSync(goPath(cwd, "state.json"), legacy);
writeFileSync(goPath(cwd, "PLAN.md"), "Keep the old plan intact.\n");
writeFileSync(join(cwd, "uat-hold"), "all");
const command = ["env", `PI_CODING_AGENT_DIR=${join(cwd, "agent")}`, `PATH=${join(cwd, "bin")}:${process.env.PATH}`, "pi",
  "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
  "-e", join(extensionDir, "fixtures/uat-provider.ts"), "-e", join(extensionDir, "index.ts"),
  "--provider", "anthropic", "--model", "go-uat-worker", "--thinking", "off", "--session", sessionFile,
].map(shellQuote).join(" ");
let started = false;
try {
  tmux("new-session", "-d", "-s", pane, "-x", "100", "-y", "30", "-c", cwd, command); started = true;
  await until(() => capture().includes("go-uat-worker") && existsSync(join(cwd, "uat-trace.jsonl")) && readFileSync(join(cwd, "uat-trace.jsonl"), "utf8").includes('"session_start"'), "Pi editor ready");
  send("/go status");
  await until(() => capture().includes("No /go run in this session"), "foreign paused run does not belong here");
  send("/go TUI isolated task B");
  await until(() => readState(cwd, sessionFile)?.status === "planning" && existsSync(join(cwd, "uat-trace.jsonl")) && readFileSync(join(cwd, "uat-trace.jsonl"), "utf8").includes('"holding"'), "B starts despite A paused");
  const first = readState(cwd, sessionFile)!;
  await until(() => /go.*planning/i.test(capture()), "planning marker visible");
  writeFileSync(join(cwd, "planning.txt"), capture());
  tmux("send-keys", "-t", pane, "Escape");
  await until(() => readState(cwd, sessionFile)?.status === "paused", "native Esc pauses B");
  send("/reload");
  await until(() => /Reloaded/i.test(capture()), "native reload completes");
  assert.equal(readState(cwd, sessionFile)?.runId, first.runId);
  tmux("resize-window", "-t", pane, "-x", "52", "-y", "30");
  await until(() => /go.*paused/i.test(capture()), "paused marker survives reload at narrow width");
  writeFileSync(join(cwd, "paused-narrow.txt"), capture());
  send("/go reset");
  await until(() => capture().includes("/go reset. Run files preserved"), "reset completes without another session");
  assert.equal(readState(cwd, sessionFile), undefined);
  assert.equal(JSON.parse(readFileSync(goPath(cwd, "state.json", first.runId), "utf8")).detached, true);
  assert.ok(!/▎.*go.*paused/i.test(capture()), "reset clears dedicated marker");
  send("/go TUI fresh task C");
  await until(() => !!readState(cwd, sessionFile) && readState(cwd, sessionFile)!.runId !== first.runId, "fresh run starts after reset");
  await until(() => /go.*planning/i.test(capture()), "fresh run has its own marker");
  tmux("send-keys", "-t", pane, "Escape");
  await until(() => readState(cwd, sessionFile)?.status === "paused", "fresh worker paused for cleanup");
  assert.equal(readFileSync(goPath(cwd, "state.json"), "utf8"), legacy);
  assert.equal(readFileSync(goPath(cwd, "PLAN.md"), "utf8"), "Keep the old plan intact.\n");
  writeFileSync(join(cwd, "fresh-paused.txt"), capture());
  console.log(JSON.stringify({ result: "PASS", cwd, checks: ["foreign paused run does not block", "visible scoped marker", "native Esc", "native reload", "52-column marker", "reset clears marker and archives", "fresh run after reset", "legacy files untouched"] }, null, 2));
} finally {
  if (started) tmux("kill-session", "-t", pane);
  console.log(`TUI UAT artifacts: ${cwd}`);
}
