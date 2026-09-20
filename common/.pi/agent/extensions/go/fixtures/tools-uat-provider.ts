// Offline provider that records the actual tool schemas sent to the model.
import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { goPath, readState } from "../core.ts";

export const fixtureTools = ["context_checkpoint", "context_timeline", "context_compact", "recall", "request_feedback", "request_code_review", "ask_user_question", "web_search", "background_job", "subagent_spawn", "custom_work", "custom_disabled"];
export default function (pi: any) {
  let cwd = process.cwd(), sessionFile: string | undefined;
  const highUsage = new Set<string>();
  const trace = (event: object) => appendFileSync(join(cwd, "tools-trace.jsonl"), JSON.stringify({ ...event, sessionFile }) + "\n");
  pi.on("session_start", (_: any, ctx: any) => { cwd = ctx.cwd; sessionFile = ctx.sessionManager.getSessionFile(); });
  for (const name of fixtureTools) pi.registerTool({ name, label: name, description: `Acceptance fixture ${name}`, parameters: Type.Object({}), async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; } });
  pi.registerProvider("anthropic", {
    baseUrl: "http://127.0.0.1:1/offline-uat", apiKey: "offline-uat", api: "anthropic-messages",
    models: ["go-tools-worker", "go-tools-reviewer"].map(id => ({ id, name: id, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 300_000, maxTokens: 4000 })),
    streamSimple(model: any, context: any, options: any) {
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
      const done = () => { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); };
      const say = (text: string) => message.content.push({ type: "text", text });
      const tool = (name: string, args: object) => { message.stopReason = "toolUse"; message.content.push({ type: "toolCall", id: `tools-${Date.now()}-${message.content.length}`, name, arguments: args }); };
      queueMicrotask(() => {
        try {
          stream.push({ type: "start", partial: message });
          const state = readState(cwd, sessionFile);
          trace({ event: "request", model: model.id, status: state?.status, runId: state?.runId, tools: context.tools?.map((t: any) => t.name), reminder: JSON.stringify(context.messages).includes("[handoff-reminder]") });
          if (model.id === "go-tools-reviewer") { say("<pass/>\n- The tool-policy acceptance fixture completed its documented checks."); done(); return; }
          if (!state || ["paused", "blocked", "done"].includes(state.status)) {
            if (existsSync(join(cwd, "normal-high"))) { message.usage.input = 100_001; message.usage.totalTokens = 100_011; }
            say("Ordinary session turn."); done(); return;
          }
          if (state.status === "reviewing" || state.resetPending) { say("Ready for the next phase."); done(); return; }
          const path = (file: string) => goPath(cwd, file, state.runId);
          if (state.status === "planning" && !existsSync(path("PLAN.md"))) {
            tool("write", { path: path("PLAN.md"), content: "# Plan\nScope: acceptance fixture.\nDone criteria: recorded tool schemas match each phase.\n- [x] Verify policy\n" });
            tool("write", { path: path("HANDOFF.md"), content: "# Handoff\nNext: verify tool policy in fresh session.\n" });
            tool("write", { path: path("JOURNAL.md"), content: "# Journal\nTool schemas are recorded by the acceptance provider.\n" });
            done(); return;
          }
          const actionPath = join(cwd, "action");
          if (existsSync(actionPath)) {
            const action = readFileSync(actionPath, "utf8").trim(); unlinkSync(actionPath);
            tool(action === "launch" ? "go_launch" : action === "done" ? "go_done" : "go_blocked", action === "blocked" ? { reason: "UAT blocker" } : {}); done(); return;
          }
          const key = `${sessionFile}:${state.status}`;
          if (!highUsage.has(key)) { highUsage.add(key); message.usage.input = 100_001; message.usage.totalTokens = 100_011; say("Crossed 100k within the attached goal."); trace({ event: "high-usage", status: state.status }); done(); return; }
          trace({ event: "holding", status: state.status });
          const abort = () => { message.stopReason = "aborted"; message.errorMessage = "UAT pause"; stream.push({ type: "error", reason: "aborted", error: message }); stream.end(); };
          if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener("abort", abort, { once: true });
        } catch (error) { message.stopReason = "error"; message.errorMessage = String(error); stream.push({ type: "error", reason: "error", error: message }); stream.end(); }
      });
      return stream;
    },
  });
}
