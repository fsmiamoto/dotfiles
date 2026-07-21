import { describe, expect, mock, test } from "bun:test";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { preflightModel, selectModel } from "./model-selection.ts";

describe("selectModel", () => {
	test("an explicit override wins over profile and parent models", () => {
		expect(selectModel({
			override: "anthropic/claude-sonnet-4",
			profile: "openai/gpt-5",
			parent: { provider: "google", id: "gemini-2.5-pro" },
		})).toEqual({
			qualified: "anthropic/claude-sonnet-4",
			provider: "anthropic",
			modelId: "claude-sonnet-4",
			source: "override",
		});
	});

	test("a profile model wins when there is no explicit override", () => {
		expect(selectModel({
			profile: "openai/gpt-5",
			parent: { provider: "google", id: "gemini-2.5-pro" },
		})).toEqual({
			qualified: "openai/gpt-5",
			provider: "openai",
			modelId: "gpt-5",
			source: "profile",
		});
	});

	test("the exact structured parent model is inherited by default", () => {
		expect(selectModel({
			parent: { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
		})).toEqual({
			qualified: "openrouter/anthropic/claude-sonnet-4",
			provider: "openrouter",
			modelId: "anthropic/claude-sonnet-4",
			source: "parent",
		});
	});

	test("a routed explicit value splits only at the first slash", () => {
		expect(selectModel({
			override: "openrouter/anthropic/model-id",
		})).toEqual({
			qualified: "openrouter/anthropic/model-id",
			provider: "openrouter",
			modelId: "anthropic/model-id",
			source: "override",
		});
	});

	test("a bare override is rejected with a source-aware error", () => {
		expect(() => selectModel({ override: "claude-sonnet-4" })).toThrow(
			'Invalid override model "claude-sonnet-4": expected provider/model with a non-empty provider and model ID',
		);
	});

	test("an override with a blank provider is rejected", () => {
		expect(() => selectModel({ override: "/claude-sonnet-4" })).toThrow(
			'Invalid override model "/claude-sonnet-4"',
		);
	});

	test("explicit model values are trimmed before parsing", () => {
		expect(selectModel({ override: "  openai/gpt-5  " })).toEqual({
			qualified: "openai/gpt-5",
			provider: "openai",
			modelId: "gpt-5",
			source: "override",
		});
	});

	test("bare, blank-provider, and blank-model profile values identify the profile source", () => {
		for (const profile of ["gpt-5", "/gpt-5", "openai/"]) {
			expect(() => selectModel({ profile })).toThrow("Invalid profile model");
		}
	});

	test("an override with a blank model ID is rejected", () => {
		expect(() => selectModel({ override: "openai/" })).toThrow("Invalid override model");
	});

	test("missing parent model information produces an actionable error", () => {
		expect(() => selectModel({})).toThrow(
			"Cannot select subagent model: current parent provider/model is unavailable; provide a qualified override or profile model",
		);
	});

	test("blank structured parent fields are treated as unavailable", () => {
		for (const parent of [
			{ provider: "", id: "gpt-5" },
			{ provider: "openai", id: "" },
		]) {
			expect(() => selectModel({ parent })).toThrow("current parent provider/model is unavailable");
		}
	});
});

describe("preflightModel", () => {
	test("returns the qualified model after registry lookup and successful authentication", async () => {
		const registeredModel = { provider: "anthropic", id: "claude-sonnet-4" };
		const registry = {
			find: (provider: string, modelId: string) =>
				provider === registeredModel.provider && modelId === registeredModel.id
					? registeredModel
					: undefined,
			getApiKeyAndHeaders: async (model: unknown) => {
				expect(model).toBe(registeredModel);
				return { ok: true as const, apiKey: "test-api-key" };
			},
		};

		await expect(preflightModel({ override: "anthropic/claude-sonnet-4" }, registry)).resolves.toEqual({
			qualified: "anthropic/claude-sonnet-4",
			provider: "anthropic",
			modelId: "claude-sonnet-4",
			source: "override",
		});
	});

	test("accepts registry success that does not require a secret", async () => {
		const registry = {
			find: () => ({ provider: "local", id: "llama" }),
			getApiKeyAndHeaders: async () => ({
				ok: true as const,
				headers: { "x-routing": "configured-without-secret" },
			}),
		};

		await expect(preflightModel({ override: "local/llama" }, registry)).resolves.toMatchObject({
			qualified: "local/llama",
			source: "override",
		});
	});

	test("rejects an unknown qualified profile before authentication", async () => {
		let authCalls = 0;
		const registry = {
			find: () => undefined,
			getApiKeyAndHeaders: async (_model: unknown) => {
				authCalls++;
				return { ok: true as const };
			},
		};

		await expect(preflightModel({ profile: "openai/missing-model" }, registry)).rejects.toThrow(
			'Unknown profile model "openai/missing-model"',
		);
		expect(authCalls).toBe(0);
	});

	test("reports authentication failure without exposing registry credentials or headers", async () => {
		const secret = "credential-should-not-leak";
		const header = "header-should-not-leak";
		const registeredModel = { provider: "google", id: "gemini-2.5-pro" };
		const registry = {
			find: () => registeredModel,
			getApiKeyAndHeaders: async () => ({
				ok: false as const,
				error: `rejected ${secret} ${header}`,
			}),
		};

		let message = "";
		try {
			await preflightModel({ parent: registeredModel }, registry);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).toContain('parent model "google/gemini-2.5-pro"');
		expect(message).not.toContain(secret);
		expect(message).not.toContain(header);
	});

	test("sanitizes an exception thrown during authentication", async () => {
		const secret = "oauth-refresh-token";
		const registry = {
			find: () => ({ provider: "openai", id: "gpt-5" }),
			getApiKeyAndHeaders: async () => {
				throw new Error(`refresh failed for ${secret}`);
			},
		};

		let message = "";
		try {
			await preflightModel({ override: "openai/gpt-5" }, registry);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).toContain('override model "openai/gpt-5"');
		expect(message).not.toContain(secret);
	});
});

let boundaryToolsPromise: Promise<Map<string, any>> | undefined;
const tmuxCommands: string[] = [];
let fakePaneExists = true;
let paneDisappearsBeforeCtrlD = false;

function getBoundaryTools(): Promise<Map<string, any>> {
	boundaryToolsPromise ??= (async () => {
		mock.module("node:child_process", () => ({
			execSync: (command: string, options?: { encoding?: string }) => {
				tmuxCommands.push(command);
				if (command.includes("send-keys")) {
					if (!fakePaneExists) throw new Error("pane missing");
					if (paneDisappearsBeforeCtrlD && command.includes("C-d")) {
						fakePaneExists = false;
						throw new Error("pane missing");
					}
				}
				if (command.includes("-p '#{pane_id}'") && !fakePaneExists) throw new Error("pane missing");
				let output = "";
				if (command.includes("display-message -p '#{window_name}'")) output = "parent\n";
				else if (command.includes(" new-window ")) output = "%42\n";
				else if (command.includes("-p '#{pane_pid}'")) output = `${process.pid}\n`;
				return options?.encoding ? output : Buffer.from(output);
			},
		}));
		mock.module("@mariozechner/pi-coding-agent", () => ({
			getAgentDir: () => "/nonexistent-test-agent-dir",
			getMarkdownTheme: () => ({}),
			parseFrontmatter: (body: string) => ({ body, frontmatter: {} }),
		}));
		mock.module("@mariozechner/pi-tui", () => ({
			Container: class {},
			Markdown: class {},
			Spacer: class {},
			Text: class {},
			matchesKey: () => false,
			truncateToWidth: (value: string) => value,
		}));
		mock.module("@sinclair/typebox", () => ({
			Type: {
				Number: (value: unknown) => value,
				Object: (value: unknown) => value,
				Optional: (value: unknown) => value,
				String: (value: unknown) => value,
			},
		}));
		const tools = new Map<string, any>();
		const pi = {
			events: { emit: () => {} },
			on: () => {},
			registerCommand: () => {},
			registerMessageRenderer: () => {},
			registerTool: (tool: any) => tools.set(tool.name, tool),
			sendMessage: () => {},
		};
		const { default: registerExtension } = await import("./index.ts");
		registerExtension(pi as any);
		return tools;
	})();
	return boundaryToolsPromise;
}

describe("agent_spawn guidance", () => {
	test("recommends omitting model to inherit the exact parent provider/model", async () => {
		const tools = await getBoundaryTools();
		const guidance = tools.get("agent_spawn").promptGuidelines.join("\n");

		expect(guidance).toContain("omit model");
		expect(guidance).toContain("exact parent provider/model");
	});

	test("model parameter help requires qualified deliberate overrides", async () => {
		const tools = await getBoundaryTools();
		const help = tools.get("agent_spawn").parameters.model.description;

		expect(help).toContain("provider/model");
		expect(help).toContain("Bare model IDs are rejected");
	});
});

describe("agent_spawn preflight boundary", () => {
	test("an unknown model creates no temp files, panes, or tracked agent", async () => {
		const previousTmux = process.env.TMUX;
		process.env.TMUX = "test-session";
		try {
			const tools = await getBoundaryTools();
			const commandStart = tmuxCommands.length;
			const ctx = {
				cwd: process.cwd(),
				model: { provider: "openai", id: "missing" },
				modelRegistry: {
					find: () => undefined,
					getApiKeyAndHeaders: async () => ({ ok: true as const }),
				},
			};
			const beforeTemp = readdirSync(tmpdir()).filter((name) => name.startsWith("pi-tmux-agents-")).sort();

			await expect(
				tools.get("agent_spawn").execute("call", { name: "unknown", task: "test" }, undefined, undefined, ctx),
			).rejects.toThrow('Unknown parent model "openai/missing"');

			const afterTemp = readdirSync(tmpdir()).filter((name) => name.startsWith("pi-tmux-agents-")).sort();
			const listed = await tools.get("agent_list").execute("call", {}, undefined, undefined, ctx);
			expect(afterTemp).toEqual(beforeTemp);
			expect(tmuxCommands).toHaveLength(commandStart);
			expect(listed.details.running).toEqual([]);
			expect(listed.details.exited).toEqual([]);
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	test("a bare override creates no temp files, panes, or tracked agent", async () => {
		const previousTmux = process.env.TMUX;
		process.env.TMUX = "test-session";
		try {
			const tools = await getBoundaryTools();
			const commandStart = tmuxCommands.length;
			let registryCalls = 0;
			const ctx = {
				cwd: process.cwd(),
				model: { provider: "openai", id: "gpt-5" },
				modelRegistry: {
					find: () => {
						registryCalls++;
						return undefined;
					},
					getApiKeyAndHeaders: async () => ({ ok: true as const }),
				},
			};
			const beforeTemp = readdirSync(tmpdir()).filter((name) => name.startsWith("pi-tmux-agents-")).sort();

			await expect(
				tools.get("agent_spawn").execute(
					"call",
					{ name: "bare", task: "test", model: "gpt-5" },
					undefined,
					undefined,
					ctx,
				),
			).rejects.toThrow('Invalid override model "gpt-5"');

			const afterTemp = readdirSync(tmpdir()).filter((name) => name.startsWith("pi-tmux-agents-")).sort();
			const listed = await tools.get("agent_list").execute("call", {}, undefined, undefined, ctx);
			expect(registryCalls).toBe(0);
			expect(afterTemp).toEqual(beforeTemp);
			expect(tmuxCommands).toHaveLength(commandStart);
			expect(listed.details.running).toEqual([]);
			expect(listed.details.exited).toEqual([]);
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	test("an unauthenticated override creates no temp files, panes, or tracked agent", async () => {
		const previousTmux = process.env.TMUX;
		process.env.TMUX = "test-session";
		try {
			const tools = await getBoundaryTools();
			const commandStart = tmuxCommands.length;
			const secret = "test-secret-header";
			const model = { provider: "anthropic", id: "claude-sonnet-4" };
			const ctx = {
				cwd: process.cwd(),
				model,
				modelRegistry: {
					find: () => model,
					getApiKeyAndHeaders: async () => ({ ok: false as const, error: secret }),
				},
			};
			const beforeTemp = readdirSync(tmpdir()).filter((name) => name.startsWith("pi-tmux-agents-")).sort();

			let message = "";
			try {
				await tools.get("agent_spawn").execute(
					"call",
					{ name: "unauth", task: "test", model: "anthropic/claude-sonnet-4" },
					undefined,
					undefined,
					ctx,
				);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}

			const afterTemp = readdirSync(tmpdir()).filter((name) => name.startsWith("pi-tmux-agents-")).sort();
			const listed = await tools.get("agent_list").execute("call", {}, undefined, undefined, ctx);
			expect(message).toContain('override model "anthropic/claude-sonnet-4"');
			expect(message).not.toContain(secret);
			expect(afterTemp).toEqual(beforeTemp);
			expect(tmuxCommands).toHaveLength(commandStart);
			expect(listed.details.running).toEqual([]);
			expect(listed.details.exited).toEqual([]);
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	test("a successful spawn command, result, and registry record use the qualified parent model", async () => {
		const previousTmux = process.env.TMUX;
		process.env.TMUX = "test-session";
		try {
			const tools = await getBoundaryTools();
			const commandStart = tmuxCommands.length;
			const registryLookups: string[] = [];
			const registeredModel = { provider: "openrouter", id: "anthropic/claude-sonnet-4" };
			const ctx = {
				cwd: process.cwd(),
				model: registeredModel,
				modelRegistry: {
					find: (provider: string, modelId: string) => {
						registryLookups.push(`${provider}/${modelId}`);
						return registeredModel;
					},
					getApiKeyAndHeaders: async () => ({ ok: true as const, headers: { "x-local": "enabled" } }),
				},
			};

			const result = await tools.get("agent_spawn").execute(
				"call",
				{ name: "qualified-success", task: "test" },
				undefined,
				undefined,
				ctx,
			);
			const listed = await tools.get("agent_list").execute("call", {}, undefined, undefined, ctx);
			const spawnCommands = tmuxCommands.slice(commandStart);

			expect(registryLookups).toEqual(["openrouter/anthropic/claude-sonnet-4"]);
			expect(result.details.model).toBe("openrouter/anthropic/claude-sonnet-4");
			expect(listed.details.running).toContainEqual(expect.objectContaining({
				name: "qualified-success",
				model: "openrouter/anthropic/claude-sonnet-4",
			}));
			expect(spawnCommands.some((command) =>
				command.includes("--model") && command.includes("openrouter/anthropic/claude-sonnet-4"),
			)).toBe(true);

			fakePaneExists = false;
			await tools.get("agent_stop").execute(
				"call",
				{ name: "qualified-success" },
				undefined,
				undefined,
				ctx,
			);
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	test("stop succeeds and cleans tracking when the pane exits before Ctrl+D", async () => {
		const previousTmux = process.env.TMUX;
		process.env.TMUX = "test-session";
		fakePaneExists = true;
		paneDisappearsBeforeCtrlD = false;
		try {
			const tools = await getBoundaryTools();
			const model = { provider: "openai", id: "gpt-5" };
			const ctx = {
				cwd: process.cwd(),
				model,
				modelRegistry: {
					find: () => model,
					getApiKeyAndHeaders: async () => ({ ok: true as const }),
				},
			};
			await tools.get("agent_spawn").execute(
				"call",
				{ name: "stop-race", task: "test" },
				undefined,
				undefined,
				ctx,
			);

			paneDisappearsBeforeCtrlD = true;
			await expect(tools.get("agent_stop").execute(
				"call",
				{ name: "stop-race" },
				undefined,
				undefined,
				ctx,
			)).resolves.toMatchObject({ details: { name: "stop-race" } });

			const listed = await tools.get("agent_list").execute("call", {}, undefined, undefined, ctx);
			expect(listed.details.running).toEqual([]);
			expect(listed.details.exited).toEqual([]);
		} finally {
			paneDisappearsBeforeCtrlD = false;
			fakePaneExists = false;
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	test("stop is successful when the agent has already been cleaned", async () => {
		const previousTmux = process.env.TMUX;
		process.env.TMUX = "test-session";
		fakePaneExists = true;
		try {
			const tools = await getBoundaryTools();
			const model = { provider: "openai", id: "gpt-5" };
			const ctx = {
				cwd: process.cwd(),
				model,
				modelRegistry: {
					find: () => model,
					getApiKeyAndHeaders: async () => ({ ok: true as const }),
				},
			};
			await tools.get("agent_spawn").execute(
				"call",
				{ name: "stop-idempotent", task: "test" },
				undefined,
				undefined,
				ctx,
			);
			fakePaneExists = false;
			await tools.get("agent_stop").execute(
				"call",
				{ name: "stop-idempotent" },
				undefined,
				undefined,
				ctx,
			);

			await expect(tools.get("agent_stop").execute(
				"call",
				{ name: "stop-idempotent" },
				undefined,
				undefined,
				ctx,
			)).resolves.toMatchObject({ details: { name: "stop-idempotent" } });
		} finally {
			fakePaneExists = false;
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});
});
