// Deterministic, offline Anthropic stand-in. Only loaded explicitly by uat.ts / -e.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readState, type GoState } from "../core.ts";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

export default function (pi: any) {
	let cwd = process.cwd();
	let sessionFile: string | undefined;
	let runPrefix = ".pi/go";
	const go = (file: string) => `${runPrefix}/${file}`;
	const read = (path: string) => existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), "utf8") : "";
	const trace = (event: object) => appendFileSync(join(cwd, "uat-trace.jsonl"), JSON.stringify(event) + "\n");
	const plan = (completed = 0) => `# UAT PLAN\nScope: create three trivial task files.\nNon-goals: no external services.\nDone criteria: for n in 1 2 3; do test "$(cat task-$n.txt)" = "task $n" || exit 1; done\n${[1, 2, 3].map(n => `- [${n <= completed ? "x" : " "}] Task ${n}`).join("\n")}\n`;
	pi.on("session_start", (_event: any, ctx: any) => {
		cwd = ctx.cwd;
		sessionFile = ctx.sessionManager.getSessionFile();
		trace({ event: "session_start", session: ctx.sessionManager.getSessionFile(), tokens: ctx.getContextUsage()?.tokens });
	});
	pi.registerProvider("anthropic", {
		baseUrl: "http://127.0.0.1:1/offline-uat",
		apiKey: "offline-uat",
		api: "anthropic-messages",
		models: ["go-uat-worker", "go-uat-reviewer"].map(id => ({
			id, name: id, reasoning: false, input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 4000,
		})),
		streamSimple(model: any, context: any, options: any) {
			const stream = createAssistantMessageEventStream();
			const last = context.messages.at(-1);
			const user = [...context.messages].reverse().find((m: any) => m.role === "user");
			const text = typeof user?.content === "string" ? user.content : user?.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") ?? "";
			runPrefix = text.match(/\.pi\/go\/runs\/[A-Za-z0-9_-]+/)?.[0] ?? (readState(cwd, sessionFile)?.runId ? `.pi/go/runs/${readState(cwd, sessionFile)!.runId}` : runPrefix);
			trace({ event: "request", model: model.id, text, tools: context.tools?.map((t: any) => t.name) });
			const message: any = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
				usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
			const done = () => { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); };
			const say = (text: string) => message.content.push({ type: "text", text });
			let id = 0;
			const tool = (name: string, args: object) => { message.stopReason = "toolUse"; message.content.push({ type: "toolCall", id: `uat-${Date.now()}-${id++}`, name, arguments: args }); };
			queueMicrotask(() => {
				try {
					stream.push({ type: "start", partial: message });
					// A native task can keep calling tools while its /go goal is paused.
					// Only steering can interrupt this loop; follow-ups starve behind it.
					if (text === "UAT native work keeps calling tools") {
						tool("read", { path: go("PLAN.md") });
						setTimeout(done, 20);
						return;
					}
					const hold = read("uat-hold").trim();
					const state: Partial<GoState> = readState(cwd, sessionFile) ?? {};
					if ((hold && !state.resetPending && (hold !== "running" || state.status === "running") && model.id === "go-uat-worker") || (read("uat-review-hold").trim() && model.id === "go-uat-reviewer")) {
						trace({ event: "holding", model: model.id });
						const abort = () => { trace({ event: "aborted", model: model.id }); message.stopReason = "aborted"; message.errorMessage = "UAT user Esc"; stream.push({ type: "error", reason: "aborted", error: message }); stream.end(); };
						if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener("abort", abort, { once: true });
						return;
					}
					if (model.id === "go-uat-reviewer") {
						if (last?.role !== "toolResult" && context.tools?.some((t: any) => t.name === "read")) tool("read", { path: go("PLAN.md") });
						else {
							const failures = Number(read("uat-review-fail-count").trim() || "0");
							if (failures > 0) {
								writeFileSync(join(cwd, "uat-review-fail-count"), String(failures - 1));
								say("<fail/>\n- Add reviewer-proof.txt containing reviewed, and journal the verification.");
							} else say([1, 2, 3].every(n => read(`task-${n}.txt`).trim() === `task ${n}`) ? "<pass/>\n- All three task artifacts match PLAN; journal evidence preserved." : "<fail/>\n- Task artifacts missing.");
						}
					} else if (text.includes("Context limit reached")) {
						say("HANDOFF is current; stopping for the requested context reset.");
					} else if (state.resetPending) {
						say("Launch handoff saved; stopping for fresh session.");
					} else if (!read(go("PLAN.md"))) {
						tool("write", { path: go("PLAN.md"), content: plan() });
						tool("write", { path: go("HANDOFF.md"), content: "# HANDOFF\nUAT handoff marker 0\nNext: task 1\n" });
						tool("bash", { command: `printf '%s\\n' '2026-09-09 UAT start: aligned three task plan; evidence: PLAN.md.' >> ${go("JOURNAL.md")}` });
					} else if (state.status === "planning") {
						tool("go_launch", {});
						tool("write", { path: "batch-after-launch.txt", content: "Tool batch finished before session replacement.\n" });
					} else if (state.status === "reviewing") {
						say("All tasks complete; ready for independent review.");
					} else if (text.includes("Independent review failed") && last?.role !== "toolResult") {
						tool("write", { path: "reviewer-proof.txt", content: "reviewed\n" });
						tool("bash", { command: `test "$(cat reviewer-proof.txt)" = reviewed && printf '%s\\n' '2026-09-09 UAT review fix: added reviewer-proof.txt; evidence: shell content assertion passed.' >> ${go("JOURNAL.md")}` });
					} else if (last?.role === "toolResult") {
						if ([1, 2, 3].every(n => read(`task-${n}.txt`))) tool("go_done", {});
						else { say("Task complete, journal and handoff saved."); message.usage.input = 25_000; message.usage.totalTokens = 25_010; }
					} else {
						const n = [1, 2, 3].find(n => !read(`task-${n}.txt`));
						if (!n) tool("go_done", {});
						else {
							tool("write", { path: `task-${n}.txt`, content: `task ${n}\n` });
							tool("write", { path: go("PLAN.md"), content: plan(n) });
							tool("write", { path: go("HANDOFF.md"), content: `# HANDOFF\nUAT handoff marker ${n}\nVerified: task-${n}.txt contains task ${n}.\nNext: ${n < 3 ? `task ${n + 1}` : "review"}\n` });
							tool("bash", { command: `test "$(cat task-${n}.txt)" = 'task ${n}' && printf '%s\\n' '2026-09-09 Task ${n}: created task-${n}.txt; evidence: shell content assertion passed.' >> ${go("JOURNAL.md")}` });
						}
					}
					done();
				} catch (error) { message.stopReason = "error"; message.errorMessage = String(error); stream.push({ type: "error", reason: "error", error: message }); stream.end(); }
			});
			return stream;
		},
	});
}
