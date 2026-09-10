// Deterministic offline model for real SDK multi-session acceptance tests.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { readState, goPath } from "../core.ts";

export default function (pi: any) {
  let cwd = process.cwd();
  let sessionFile: string | undefined;
  const trace = (event: object) => appendFileSync(join(cwd, "scoping-trace.jsonl"), JSON.stringify({ ...event, sessionFile }) + "\n");
  pi.on("session_start", (_: any, ctx: any) => { cwd = ctx.cwd; sessionFile = ctx.sessionManager.getSessionFile(); trace({ event: "session_start" }); });
  pi.registerProvider("anthropic", {
    baseUrl: "http://127.0.0.1:1/offline-uat", apiKey: "offline-uat", api: "anthropic-messages",
    models: [{ id: "go-scoping-uat", name: "offline scoping fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 4000 }],
    streamSimple(model: any, context: any, options: any) {
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
      const done = () => { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); };
      const say = (text: string) => message.content.push({ type: "text", text });
      const tool = (name: string, args: object) => { message.stopReason = "toolUse"; message.content.push({ type: "toolCall", id: `scope-${Date.now()}-${message.content.length}`, name, arguments: args }); };
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        const state = readState(cwd, sessionFile);
        trace({ event: "request", runId: state?.runId, status: state?.status, system: context.systemPrompt });
        if (!state) { say("No goal in this session."); done(); return; }
        const path = (file: string) => goPath(cwd, file, state.runId);
        if (state.status === "planning" && !existsSync(path("PLAN.md"))) {
          tool("write", { path: path("PLAN.md"), content: `# Plan ${state.steering}\nScope: isolated ${state.runId}.\nDone criteria: preserve this run.\n- [ ] Complete goal\n` });
          tool("write", { path: path("HANDOFF.md"), content: `# Handoff ${state.runId}\nNext: scoped work\n` });
          tool("write", { path: path("JOURNAL.md"), content: `Journal ${state.runId}\n` });
          done(); return;
        }
        if (state.status === "planning" && existsSync(join(cwd, `launch-${state.runId}`))) { tool("go_launch", {}); done(); return; }
        if (state.resetPending) {
          if (state.resetKind === "context" && !readFileSync(path("HANDOFF.md"), "utf8").includes("SCOPED_CONTEXT_HANDOFF")) {
            tool("write", { path: path("HANDOFF.md"), content: `# Handoff ${state.runId}\nSCOPED_CONTEXT_HANDOFF\nNext: preserve same run directory\n` });
            tool("write", { path: path("JOURNAL.md"), content: readFileSync(path("JOURNAL.md"), "utf8") + "Context handoff verified\n" });
          } else say("Handoff saved; ready for replacement.");
          done(); return;
        }
        if (state.status === "running" && state.resets === 0 && existsSync(join(cwd, `context-${state.runId}`))) {
          message.usage.input = 25_000; message.usage.totalTokens = 25_010; say("Context threshold reached."); done(); return;
        }
        trace({ event: "holding", runId: state.runId, status: state.status });
        const abort = () => { trace({ event: "aborted", runId: state.runId }); message.stopReason = "aborted"; message.errorMessage = "UAT cancellation"; stream.push({ type: "error", reason: "aborted", error: message }); stream.end(); };
        if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener("abort", abort, { once: true });
      });
      return stream;
    },
  });
}
