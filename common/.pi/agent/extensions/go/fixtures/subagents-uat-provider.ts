// Explicitly loaded by subagents.uat.ts only. No network or real credentials.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readState, type GoState } from "../core.ts";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

export default function (pi: any) {
  let cwd = process.cwd();
  let sessionFile: string | undefined;
  const go = (file: string) => `.pi/go/runs/${readState(cwd, sessionFile)!.runId}/${file}`;
  const read = (path: string) => existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), "utf8") : "";
  const trace = (event: object) => appendFileSync(join(cwd, "subagents-trace.jsonl"), JSON.stringify(event) + "\n");
  pi.on("session_start", (_: any, ctx: any) => { cwd = ctx.cwd; sessionFile = ctx.sessionManager.getSessionFile(); });
  pi.registerProvider("anthropic", {
    baseUrl: "http://127.0.0.1:1/offline-uat", apiKey: "offline-uat", api: "anthropic-messages",
    models: ["parent", "child", "reviewer"].map(role => ({
      id: `go-subagent-uat-${role}`, name: role, reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 4000,
    })),
    streamSimple(model: any, context: any, options: any) {
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
      const done = () => { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); };
      const say = (text: string) => message.content.push({ type: "text", text });
      const tool = (name: string, args: object) => { message.stopReason = "toolUse"; message.content.push({ type: "toolCall", id: `sub-uat-${Date.now()}`, name, arguments: args }); };
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        const state: Partial<GoState> = readState(cwd, sessionFile) ?? {};
        const proof = "SUBAGENT_EFFORT_PRESERVED_7a9f";
        const input = JSON.stringify(context.messages);
        trace({ event: "request", model: model.id, resetPending: state.resetPending, hasProof: input.includes(proof) });
        if (model.id.endsWith("child")) {
          if (!read("child-effort.txt")) { tool("write", { path: "child-effort.txt", content: "Child completed expensive work.\n" }); done(); return; }
          trace({ event: "child_holding" });
          const timer = setInterval(() => {
            if (!read("release-child")) return;
            clearInterval(timer);
            options?.signal?.removeEventListener("abort", abort);
            trace({ event: "child_completed" });
            say(proof); done();
          }, 20);
          const abort = () => { clearInterval(timer); trace({ event: "child_aborted" }); message.stopReason = "aborted"; message.errorMessage = "Child cancelled"; stream.push({ type: "error", reason: "aborted", error: message }); stream.end(); };
          if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener("abort", abort, { once: true });
          return;
        }
        if (model.id.endsWith("reviewer")) { say("<pass/>\n- Child evidence exists and the parent integrated its completed report."); done(); return; }
        if (state.status === "planning") {
          if (!read(go("PLAN.md"))) tool("write", { path: go("PLAN.md"), content: "# Preserve subagent effort\nScope: retain child work through context reset.\nDone criteria: child-effort.txt exists and child proof is preserved in HANDOFF.\n- [x] Verify child work and report survive handoff\n" });
          else if (!read(go("HANDOFF.md"))) tool("write", { path: go("HANDOFF.md"), content: "# HANDOFF\nNext: spawn child, preserve result through context reset.\n" });
          else tool("go_launch", {});
          done(); return;
        }
        if (state.status === "reviewing" || state.resetKind === "launch") { say("Stopping for the requested transition."); done(); return; }
        if (!read("spawned")) {
          writeFileSync(join(cwd, "spawned"), "yes");
          tool("subagent_spawn", { prompt: "Produce delayed evidence for the parent handoff.", name: "handoff-proof", harness: "pi", model: "anthropic/go-subagent-uat-child", reasoning_effort: "off" });
          done(); return;
        }
        if (!read("threshold-raised")) {
          writeFileSync(join(cwd, "threshold-raised"), "yes");
          message.usage.input = 25_000; message.usage.totalTokens = 25_010;
          say("Context threshold reached; background effort remains active."); done(); return;
        }
        if (input.includes(proof) && !read(go("HANDOFF.md")).includes(proof)) {
          trace({ event: "parent_integrates_result" });
          tool("write", { path: go("HANDOFF.md"), content: `# HANDOFF\nVerified child result: ${proof}\nEvidence: child-effort.txt. Next: independent review.\n` });
          done(); return;
        }
        if (input.includes(proof) && !read(go("JOURNAL.md")).includes(proof)) {
          tool("write", { path: go("JOURNAL.md"), content: read(go("JOURNAL.md")) + `Verified completed child evidence and integrated result: ${proof}\n` });
          done(); return;
        }
        if (state.resetPending) { say("Waiting for child report, then preserving it in HANDOFF before reset."); done(); return; }
        if (input.includes(proof)) { tool("go_done", {}); done(); return; }
        say("Waiting for child to complete."); done();
      });
      return stream;
    },
  });
}
