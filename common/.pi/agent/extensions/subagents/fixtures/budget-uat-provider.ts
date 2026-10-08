// Explicitly loaded by budget.uat.ts only. No network or real credentials.
// Parent spawns one Pi child; the child reports a huge or small context usage
// depending on the slice marker in its prompt.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { SUBAGENT_CONTEXT_BUDGET_STEER, SUBAGENT_OVER_BUDGET_NOTE } from "../src/prompt.ts";

export default function (pi: any) {
  let cwd = process.cwd();
  const trace = (event: object) => appendFileSync(join(cwd, "budget-trace.jsonl"), JSON.stringify(event) + "\n");
  const scenario = () => readFileSync(join(cwd, "scenario"), "utf8").trim();
  pi.on("session_start", (_: any, ctx: any) => { cwd = ctx.cwd; });
  pi.registerProvider("anthropic", {
    baseUrl: "http://127.0.0.1:1/offline-uat", apiKey: "offline-uat", api: "anthropic-messages",
    models: ["parent", "child"].map(role => ({
      id: `budget-uat-${role}`, name: role, reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 4000,
    })),
    streamSimple(model: any, context: any) {
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
      const done = () => { stream.push({ type: "done", reason: message.stopReason, message }); stream.end(); };
      const say = (text: string) => message.content.push({ type: "text", text });
      const tool = (name: string, args: object) => { message.stopReason = "toolUse"; message.content.push({ type: "toolCall", id: `budget-uat-${Date.now()}`, name, arguments: args }); };
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        const input = JSON.stringify(context.messages);
        if (model.id.endsWith("child")) {
          const big = input.includes("BIG-SLICE");
          const steers = input.split(SUBAGENT_CONTEXT_BUDGET_STEER).length - 1;
          const hasToolResult = context.messages.some((m: any) => m.role === "toolResult");
          trace({ event: "child_request", big, steers, hasToolResult });
          if (big) { message.usage.input = 120_000; message.usage.totalTokens = 120_010; }
          // Slow tool keeps the run streaming while the manager folds usage and steers.
          if (!hasToolResult) { tool("bash", { command: "sleep 1; echo slice-work" }); done(); return; }
          say(`CHILD_REPORT_${scenario()}: done=slice-work; left=rest of module; next slices=split by file.`); done(); return;
        }
        const report = input.includes(`CHILD_REPORT_${scenario()}`);
        trace({ event: "parent_request", report, note: input.includes(SUBAGENT_OVER_BUDGET_NOTE) });
        if (report) { say("Parent integrated child report."); done(); return; }
        if (!context.messages.some((m: any) => m.role === "toolResult")) {
          const marker = scenario() === "big" ? "BIG-SLICE" : "SMALL-SLICE";
          tool("subagent_spawn", { prompt: `${marker}: do the slice and report.`, name: `budget-${scenario()}`, harness: "pi", model: "anthropic/budget-uat-child", reasoning_effort: "off" });
          done(); return;
        }
        say("Waiting for child."); done();
      });
      return stream;
    },
  });
}
