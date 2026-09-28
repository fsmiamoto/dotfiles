// Offline provider for model.uat.ts: records the model + thinking level of every request.
// GO_MODEL_UAT_NO_ALT=1 at load time omits go-model-alt (simulates an unavailable carried model).
import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream, getCurrentTools } from "@earendil-works/pi-ai";
import { goPath, readState } from "../core.ts";

export default function (pi: any) {
  let cwd = process.cwd(), sessionFile: string | undefined;
  const trace = (event: object) => appendFileSync(join(cwd, "model-trace.jsonl"), JSON.stringify({ ...event, sessionFile }) + "\n");
  pi.on("session_start", (_: any, ctx: any) => { cwd = ctx.cwd; sessionFile = ctx.sessionManager.getSessionFile(); trace({ event: "session_start" }); });
  const ids = ["go-model-default", ...(process.env.GO_MODEL_UAT_NO_ALT ? [] : ["go-model-alt"]), "go-model-reviewer"];
  pi.registerProvider("anthropic", {
    baseUrl: "http://127.0.0.1:1/offline-uat", apiKey: "offline-uat", api: "anthropic-messages",
    models: ids.map(id => ({ id, name: id, reasoning: id !== "go-model-reviewer", input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 4000 })),
    streamSimple(model: any, context: any, options: any) {
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
      const done = () => { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); };
      const say = (text: string) => message.content.push({ type: "text", text });
      const tool = (name: string, args: object) => { message.stopReason = "toolUse"; message.content.push({ type: "toolCall", id: `model-${Date.now()}-${message.content.length}`, name, arguments: args }); };
      const last = context.messages.at(-1);
      const user = [...context.messages].reverse().find((m: any) => m.role === "user");
      const text = typeof user?.content === "string" ? user.content : user?.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") ?? "";
      queueMicrotask(() => {
        try {
          stream.push({ type: "start", partial: message });
          const state = readState(cwd, sessionFile);
          trace({ event: "request", model: model.id, reasoning: options?.reasoning ?? "off", status: state?.status, runId: state?.runId });
          if (model.id === "go-model-reviewer") {
            if (last?.role !== "toolResult" && getCurrentTools(context.messages).some((t: any) => t.name === "read")) tool("read", { path: goPath(cwd, "PLAN.md", state?.runId) });
            else say("<pass/>\n- Model carry acceptance fixture verified.");
            done(); return;
          }
          if (!state || !["planning", "running", "reviewing"].includes(state.status)) { say("Idle."); done(); return; }
          const path = (file: string) => goPath(cwd, file, state.runId);
          if (text.includes("Context limit reached")) { say("HANDOFF is current; stopping."); done(); return; }
          if (state.resetPending) { say("Stopping for fresh session."); done(); return; }
          if (state.status === "reviewing") { say("Ready for review."); done(); return; }
          if (state.status === "planning") {
            if (!existsSync(path("PLAN.md"))) {
              tool("write", { path: path("PLAN.md"), content: "# Plan\nScope: model carry fixture.\nDone criteria: requests use the carried model.\n- [x] Carry\n" });
              tool("write", { path: path("HANDOFF.md"), content: "# Handoff\nNext: verify carried model.\n" });
              tool("write", { path: path("JOURNAL.md"), content: "# Journal\nModel carry fixture start.\n" });
            } else if (text === "UAT launch now" && last?.role !== "toolResult") tool("go_launch", {});
            else say("Plan ready.");
            done(); return;
          }
          // running
          const hold = join(cwd, "uat-hold"), release = join(cwd, "uat-release");
          if (existsSync(hold) && last?.role !== "toolResult") {
            trace({ event: "holding", model: model.id, reasoning: options?.reasoning ?? "off" });
            const timer = setInterval(() => {
              if (!existsSync(release)) return;
              clearInterval(timer); unlinkSync(hold); unlinkSync(release);
              // Cross the context threshold so the next handoff is a context reset.
              message.usage.input = 25_000; message.usage.totalTokens = 25_010;
              say("Worked; context is large now."); done();
            }, 20);
            // A failed assertion aborts on cleanup; never keep the process alive.
            options?.signal?.addEventListener("abort", () => { clearInterval(timer); message.stopReason = "aborted"; stream.push({ type: "error", reason: "aborted", error: message }); stream.end(); }, { once: true });
            return;
          }
          if (last?.role === "toolResult") say("Done requested.");
          else tool("go_done", {});
          done();
        } catch (error) { message.stopReason = "error"; message.errorMessage = String(error); stream.push({ type: "error", reason: "error", error: message }); stream.end(); }
      });
      return stream;
    },
  });
}
