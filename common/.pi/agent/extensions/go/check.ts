// Full offline regression suite. Requires installed Pi SDK, pi and tmux.
// Run from any directory: node /path/to/go/check.ts
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const suites = [
  ["--test", ...readdirSync(cwd).filter(file => file.endsWith(".test.ts")).sort()],
  ["scoping.uat.ts"], ["tools.uat.ts"], ["uat.ts"], ["subagents.uat.ts"], ["tui.uat.ts"],
];
for (const args of suites) {
  console.log(`\n▶ node ${args.join(" ")}`);
  execFileSync(process.execPath, args, { cwd, stdio: "inherit", timeout: 180_000 });
}
console.log(`\nPASS: all /go regression suites (${join(cwd, "UAT.md")})`);
