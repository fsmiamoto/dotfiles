import { describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

mock.module("@earendil-works/pi-coding-agent", () => ({
	CONFIG_DIR_NAME: ".pi",
	getAgentDir: () => "/unused-test-agent-dir",
}));

const piInstallation = await import(join(
	homedir(),
	".local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js",
));
const SettingsManager = piInstallation.SettingsManager;
const extension = await import("./index.ts");
const {
	SerializedSettingsGuard,
	atomicWriteSettings,
	captureGuarded,
	hasExplicitModelArg,
	mergeEffectiveDefaults,
	readSettings,
	registerSessionModelDefaults,
	restoreGuarded,
	restoreGuardedFile,
} = extension;
const registerExtension = extension.default;

async function fixture(settings: Record<string, unknown> = {}) {
	const root = await mkdtemp(join(tmpdir(), "session-model-defaults-"));
	const globalPath = join(root, "settings.json");
	await writeFile(globalPath, JSON.stringify(settings));
	return { root, globalPath };
}

function createHarness(globalPath: string, options: {
	argv?: string[];
	cwd?: string;
	trusted?: boolean;
	model?: { provider: string; id: string };
	thinking?: string;
	models?: Array<{ provider: string; id: string }>;
	authenticated?: boolean;
	yieldForPiWrite?: () => Promise<void>;
	realWatcher?: boolean;
} = {}) {
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const commands = new Map<string, any>();
	const notifications: Array<[string, string]> = [];
	const setModels: Array<{ provider: string; id: string }> = [];
	const setThinking: string[] = [];
	let settingsChangeListener: (() => void | Promise<void>) | undefined;
	let watchStarts = 0;
	let watchStops = 0;
	let thinking = options.thinking ?? "medium";
	const ctx: any = {
		cwd: options.cwd ?? join(globalPath, ".."),
		model: options.model ?? { provider: "fallback", id: "valid" },
		isProjectTrusted: () => options.trusted ?? false,
		modelRegistry: {
			find: (provider: string, id: string) => (options.models ?? []).find((model) => model.provider === provider && model.id === id),
			getApiKeyAndHeaders: async () => options.authenticated === false
				? { ok: false, error: "not authenticated" }
				: { ok: true },
		},
		ui: { notify: (message: string, level: string) => notifications.push([message, level]) },
	};
	const pi: any = {
		on: (name: string, handler: any) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
		registerCommand: (name: string, command: any) => commands.set(name, command),
		setModel: async (model: { provider: string; id: string }) => {
			setModels.push(model);
			ctx.model = model;
			return true;
		},
		getThinkingLevel: () => thinking,
		setThinkingLevel: (level: string) => { thinking = level; setThinking.push(level); },
	};
	registerSessionModelDefaults(pi, {
		globalSettingsPath: globalPath,
		argv: options.argv ?? [],
		yieldForPiWrite: options.yieldForPiWrite ?? (async () => {}),
		...(options.realWatcher ? {} : {
			watchSettingsFile: (_path: string, watchOptions: { persistent: false }, listener: () => void | Promise<void>) => {
				expect(watchOptions).toEqual({ persistent: false });
				watchStarts++;
				settingsChangeListener = listener;
			},
			unwatchSettingsFile: (_path: string, listener: () => void | Promise<void>) => {
				watchStops++;
				if (settingsChangeListener === listener) settingsChangeListener = undefined;
			},
		}),
	});
	const emit = async (name: string, event: any) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	const triggerSettingsChange = async () => {
		await settingsChangeListener?.();
	};
	return {
		commands,
		ctx,
		emit,
		getThinking: () => thinking,
		notifications,
		setModels,
		setThinking,
		triggerSettingsChange,
		watchState: () => ({ active: settingsChangeListener !== undefined, starts: watchStarts, stops: watchStops }),
	};
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 1000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!await check()) {
		if (Date.now() >= deadline) throw new Error(`condition was not met within ${timeoutMs}ms`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("pure settings helpers", () => {
	test("captures and restores values and absence without touching unrelated settings", () => {
		const accepted = captureGuarded({ defaultProvider: "openai", defaultThinkingLevel: "high", theme: "dark" });
		const restored = restoreGuarded({
			defaultProvider: "other",
			defaultModel: "temporary",
			defaultThinkingLevel: "low",
			theme: "light",
			concurrent: 42,
		}, accepted);
		expect(restored).toEqual({
			defaultProvider: "openai",
			defaultThinkingLevel: "high",
			theme: "light",
			concurrent: 42,
		});
	});

	test("trusted project values override global values independently", () => {
		expect(mergeEffectiveDefaults(
			{ defaultProvider: "global", defaultModel: "global-model", defaultThinkingLevel: "low", theme: "dark" },
			{ defaultModel: "project-model", defaultThinkingLevel: "high", theme: "ignored" },
		)).toEqual({
			defaultProvider: "global",
			defaultModel: "project-model",
			defaultThinkingLevel: "high",
			theme: "dark",
		});
	});

	test("detects separate and equals-form CLI model overrides", () => {
		expect(hasExplicitModelArg(["--model", "openai/gpt:high"])).toBe(true);
		expect(hasExplicitModelArg(["--model=openai/gpt:high"])).toBe(true);
		expect(hasExplicitModelArg(["--models", "openai/gpt"])).toBe(false);
		expect(hasExplicitModelArg(["--model"])).toBe(false);
	});
});

describe("safe persistence", () => {
	test("atomic writes preserve a global settings symlink", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-model-defaults-link-"));
		const actual = join(root, "actual.json");
		const link = join(root, "settings.json");
		await writeFile(actual, JSON.stringify({ old: true }));
		await symlink("actual.json", link);
		await atomicWriteSettings(link, { next: true });
		expect(await readFile(link, "utf8")).toContain('"next": true');
		expect((await import("node:fs/promises")).lstat(link).then((value) => value.isSymbolicLink())).resolves.toBe(true);
	});

	test("restoration preserves unrelated changes made after the accepted snapshot", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", unrelated: 1 });
		const snapshot = captureGuarded(await readSettings(globalPath));
		await writeFile(globalPath, JSON.stringify({ defaultProvider: "temporary", defaultModel: "temp", unrelated: 2, concurrent: true }));
		await restoreGuardedFile(globalPath, snapshot);
		expect(await readSettings(globalPath)).toEqual({ defaultProvider: "accepted", unrelated: 2, concurrent: true });
	});

	test("malformed settings are never overwritten", async () => {
		const { globalPath } = await fixture();
		await writeFile(globalPath, "{ broken");
		await expect(restoreGuardedFile(globalPath, captureGuarded({}))).rejects.toThrow();
		expect(await readFile(globalPath, "utf8")).toBe("{ broken");
	});

	test("serialized rapid restorations cannot leave a transient default", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base", marker: 1 });
		const guard = new SerializedSettingsGuard(globalPath, async () => {});
		await guard.initialize();
		await writeFile(globalPath, JSON.stringify({ defaultProvider: "temp1", defaultModel: "one", marker: 2 }));
		const first = guard.restoreAfterPiWrite();
		const second = first.then(async () => {
			await writeFile(globalPath, JSON.stringify({ defaultProvider: "temp2", defaultModel: "two", marker: 3 }));
			return guard.restoreAfterPiWrite();
		});
		await Promise.all([first, second]);
		expect(await readSettings(globalPath)).toEqual({ defaultProvider: "accepted", defaultModel: "base", marker: 3 });
	});

	test("failed explicit saves leave the accepted snapshot unchanged", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base" });
		const guard = new SerializedSettingsGuard(globalPath, async () => {});
		await guard.initialize();
		await writeFile(globalPath, "{ malformed");

		await expect(guard.save({
			defaultProvider: "new",
			defaultModel: "new",
			defaultThinkingLevel: "high",
		})).rejects.toThrow();

		await writeFile(globalPath, JSON.stringify({ defaultProvider: "temporary", defaultModel: "temporary" }));
		await guard.restoreAfterPiWrite();
		await guard.drain();
		expect(await readSettings(globalPath)).toEqual({ defaultProvider: "accepted", defaultModel: "base" });
	});

	test("queued reconciliation observes the snapshot from an explicit save", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base", unrelated: true });
		const guard = new SerializedSettingsGuard(globalPath, async () => {});
		await guard.initialize();

		const save = guard.save({
			defaultProvider: "new",
			defaultModel: "new-model",
			defaultThinkingLevel: "high",
		});
		const reconciliation = guard.reconcile();
		await Promise.all([save, reconciliation]);

		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "new",
			defaultModel: "new-model",
			defaultThinkingLevel: "high",
			unrelated: true,
		});
	});

	test("reconciliation does not rewrite when only unrelated settings changed", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base", unrelated: 1 });
		const guard = new SerializedSettingsGuard(globalPath, async () => {});
		await guard.initialize();
		const changed = "{\n  \"defaultProvider\": \"accepted\",\n  \"defaultModel\": \"base\",\n  \"unrelated\": 2\n}";
		await writeFile(globalPath, changed);

		await guard.reconcile();

		expect(await readFile(globalPath, "utf8")).toBe(changed);
	});

	test("adjacent real Pi settings writes preserve both sides without ELOCKED", async () => {
		const { root, globalPath } = await fixture({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "keep",
		});
		const guard = new SerializedSettingsGuard(globalPath, async () => {});
		await guard.initialize();
		const manager = SettingsManager.create(root, root, { projectTrusted: false });

		// Pi queues its synchronous lock/read/merge/write first; guard follows.
		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "session",
			defaultThinkingLevel: "high",
			unrelated: "keep",
		}));
		manager.setTheme("dark");
		await Promise.all([manager.flush(), guard.reconcile()]);
		expect(manager.drainErrors()).toEqual([]);
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "keep",
			theme: "dark",
		});

		// Guard queues first; Pi must then merge its unrelated write from restored disk.
		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "another-temporary",
			defaultModel: "another-session",
			defaultThinkingLevel: "high",
			unrelated: "keep",
			theme: "dark",
		}));
		const reconciliation = guard.reconcile();
		manager.setShowCacheMissNotices(true);
		await Promise.all([reconciliation, manager.flush()]);
		expect(manager.drainErrors()).toEqual([]);
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "keep",
			theme: "dark",
			showCacheMissNotices: true,
		});
	});
});

describe("extension events", () => {
	test("applies trusted effective defaults on startup/new/resume/fork but not reload", async () => {
		for (const reason of ["startup", "new", "resume", "fork"]) {
			const { root, globalPath } = await fixture({
				defaultProvider: "global",
				defaultModel: "base",
				defaultThinkingLevel: "low",
			});
			await mkdir(join(root, ".pi"));
			await writeFile(join(root, ".pi", "settings.json"), JSON.stringify({ defaultModel: "project", defaultThinkingLevel: "high" }));
			const harness = createHarness(globalPath, {
				cwd: root,
				trusted: true,
				models: [{ provider: "global", id: "project" }],
			});
			await harness.emit("session_start", { reason });
			expect(harness.setModels).toEqual([{ provider: "global", id: "project" }]);
			expect(harness.setThinking).toEqual(["high"]);
		}
		const { globalPath } = await fixture({ defaultProvider: "x", defaultModel: "y", defaultThinkingLevel: "high" });
		const reload = createHarness(globalPath, { models: [{ provider: "x", id: "y" }] });
		await reload.emit("session_start", { reason: "reload" });
		expect(reload.setModels).toEqual([]);
		expect(reload.setThinking).toEqual([]);
	});

	test("ignores untrusted project settings and keeps CLI model startup session-only", async () => {
		const { root, globalPath } = await fixture({ defaultProvider: "global", defaultModel: "base", defaultThinkingLevel: "low" });
		await mkdir(join(root, ".pi"));
		await writeFile(join(root, ".pi", "settings.json"), "{ malformed and untrusted");
		const untrusted = createHarness(globalPath, {
			cwd: root,
			trusted: false,
			models: [{ provider: "global", id: "base" }, { provider: "evil", id: "project" }],
		});
		await untrusted.emit("session_start", { reason: "startup" });
		expect(untrusted.setModels).toEqual([{ provider: "global", id: "base" }]);

		const cli = createHarness(globalPath, { argv: ["--model", "cli/model:high"], models: [{ provider: "global", id: "base" }] });
		await cli.emit("session_start", { reason: "startup" });
		expect(cli.setModels).toEqual([]);
		expect(cli.setThinking).toEqual([]);
	});

	test("ordinary model and thinking events restore disk defaults while runtime stays selected", async () => {
		const { globalPath } = await fixture({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "keep",
		});
		const harness = createHarness(globalPath);
		await harness.emit("session_start", { reason: "startup" });
		harness.ctx.model = { provider: "temporary", id: "session" };
		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "session",
			defaultThinkingLevel: "high",
			unrelated: "concurrent",
		}));
		await harness.emit("model_select", { source: "cycle", model: harness.ctx.model });
		await harness.emit("thinking_level_select", { level: "high" });
		expect(harness.ctx.model).toEqual({ provider: "temporary", id: "session" });
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "concurrent",
		});
	});

	test("real watcher promptly reconciles atomic replacements and remains armed", async () => {
		const { root, globalPath } = await fixture({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
		});
		const harness = createHarness(globalPath, {
			model: { provider: "temporary", id: "session" },
			realWatcher: true,
		});
		await harness.emit("session_start", { reason: "reload" });

		const replaceSettings = async (name: string, concurrent: string) => {
			const replacement = join(root, name);
			await writeFile(replacement, JSON.stringify({
				defaultProvider: "temporary",
				defaultModel: "session",
				defaultThinkingLevel: "high",
				concurrent,
			}));
			await rename(replacement, globalPath);
		};
		const started = Date.now();
		await replaceSettings("first.json", "first");
		await waitFor(async () => (await readSettings(globalPath)).defaultProvider === "accepted", 1000);
		expect(Date.now() - started).toBeLessThan(1000);

		// Guard reconciliation also atomically renames settings.json. Directory
		// watching must remain active for a later replacement without re-arming.
		await replaceSettings("second.json", "second");
		await waitFor(async () => {
			const settings = await readSettings(globalPath);
			return settings.defaultProvider === "accepted" && settings.concurrent === "second";
		}, 1000);
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			concurrent: "second",
		});
		expect(harness.notifications).toEqual([]);
		await harness.emit("session_shutdown", { reason: "reload" });
	});

	test("real watcher follows a settings symlink target", async () => {
		const { root, globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base" });
		const actual = join(root, "actual.json");
		await rename(globalPath, actual);
		await symlink("actual.json", globalPath);
		const harness = createHarness(globalPath, { realWatcher: true });
		await harness.emit("session_start", { reason: "reload" });

		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "session",
			concurrent: true,
		}));
		await waitFor(async () => (await readSettings(globalPath)).defaultProvider === "accepted", 1000);

		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			concurrent: true,
		});
		expect((await import("node:fs/promises")).lstat(globalPath).then((value) => value.isSymbolicLink())).resolves.toBe(true);
		await harness.emit("session_shutdown", { reason: "reload" });
	});

	test("injected watcher reconciles guarded defaults when equal-model selection emits no event", async () => {
		const { globalPath } = await fixture({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "keep",
		});
		const harness = createHarness(globalPath, { model: { provider: "temporary", id: "session" } });
		await harness.emit("session_start", { reason: "reload" });

		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "session",
			defaultThinkingLevel: "high",
			unrelated: "concurrent",
		}));
		await harness.triggerSettingsChange();

		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "concurrent",
		});
		expect(harness.notifications).toEqual([]);
	});

	test("watcher is lifecycle-safe, idempotent, and stopped on shutdown", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base" });
		const harness = createHarness(globalPath);
		expect(harness.watchState()).toEqual({ active: false, starts: 0, stops: 0 });

		await harness.emit("session_start", { reason: "reload" });
		await harness.emit("session_start", { reason: "reload" });
		expect(harness.watchState()).toEqual({ active: true, starts: 1, stops: 0 });

		await harness.emit("session_shutdown", { reason: "reload" });
		expect(harness.watchState()).toEqual({ active: false, starts: 1, stops: 1 });
	});

	test("watcher reconciliation failures are visible and do not overwrite malformed settings", async () => {
		const { globalPath } = await fixture({ defaultProvider: "accepted", defaultModel: "base" });
		const harness = createHarness(globalPath);
		await harness.emit("session_start", { reason: "reload" });
		await writeFile(globalPath, "{ malformed");

		await harness.triggerSettingsChange();

		expect(harness.notifications.some(([message, level]) =>
			level === "error" && message.includes("Could not restore model defaults"),
		)).toBe(true);
		expect(await readFile(globalPath, "utf8")).toBe("{ malformed");
	});

	test("shutdown immediately reconciles a change not yet observed by the watcher", async () => {
		const { globalPath } = await fixture({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
		});
		const harness = createHarness(globalPath);
		await harness.emit("session_start", { reason: "reload" });
		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "temporary",
			defaultThinkingLevel: "high",
			unrelated: "preserved",
		}));

		await harness.emit("session_shutdown", { reason: "new" });

		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
			unrelated: "preserved",
		});
	});

	test("shutdown drains a fire-and-forget thinking restoration before a fresh instance snapshots settings", async () => {
		const { globalPath } = await fixture({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
		});
		let releaseRestore!: () => void;
		const restoreCanFinish = new Promise<void>((resolve) => { releaseRestore = resolve; });
		const oldInstance = createHarness(globalPath, { yieldForPiWrite: () => restoreCanFinish });
		await oldInstance.emit("session_start", { reason: "reload" });
		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "temporary",
			defaultThinkingLevel: "high",
		}));

		const notification = oldInstance.emit("thinking_level_select", { level: "high" });
		const shutdown = oldInstance.emit("session_shutdown", { reason: "new" });
		let shutdownFinished = false;
		void shutdown.then(() => { shutdownFinished = true; });
		await Promise.resolve();
		expect(shutdownFinished).toBe(false);
		releaseRestore();
		await Promise.all([notification, shutdown]);

		const freshInstance = createHarness(globalPath);
		await freshInstance.emit("session_start", { reason: "reload" });
		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "another-temporary",
			defaultModel: "another-temporary",
			defaultThinkingLevel: "max",
		}));
		await freshInstance.emit("thinking_level_select", { level: "max" });
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "accepted",
			defaultModel: "base",
			defaultThinkingLevel: "low",
		});
	});

	test("reports a queued restoration failure while shutdown still completes", async () => {
		const { globalPath } = await fixture({ defaultThinkingLevel: "low" });
		const harness = createHarness(globalPath);
		await harness.emit("session_start", { reason: "reload" });
		await writeFile(globalPath, "{ malformed");

		const notification = harness.emit("thinking_level_select", { level: "high" });
		await harness.emit("session_shutdown", { reason: "reload" });
		await notification;

		expect(harness.notifications.some(([message, level]) =>
			level === "error" && message.includes("Could not restore model defaults"),
		)).toBe(true);
		expect(await readFile(globalPath, "utf8")).toBe("{ malformed");
	});

	test("warns for invalid or incomplete configured provider/model defaults", async () => {
		for (const settings of [
			{ defaultProvider: 42, defaultModel: "model" },
			{ defaultProvider: "provider" },
			{ defaultModel: "model" },
			{ defaultProvider: "", defaultModel: "model" },
		]) {
			const { globalPath } = await fixture(settings);
			const harness = createHarness(globalPath);
			await harness.emit("session_start", { reason: "startup" });
			expect(harness.notifications.some(([message, level]) =>
				level === "warning" && message.includes("invalid or incomplete") && message.includes("keeping current model"),
			)).toBe(true);
			expect(harness.setModels).toEqual([]);
		}
	});

	test("explicit command saves all fields, preserves unrelated settings, and reports project overrides", async () => {
		const { root, globalPath } = await fixture({ defaultProvider: "old", defaultModel: "old", unrelated: { keep: true } });
		await mkdir(join(root, ".pi"));
		await writeFile(join(root, ".pi", "settings.json"), JSON.stringify({ defaultModel: "project" }));
		const harness = createHarness(globalPath, {
			cwd: root,
			trusted: true,
			model: { provider: "openai", id: "gpt" },
			thinking: "high",
		});
		await harness.emit("session_start", { reason: "startup" });
		await harness.commands.get("set-model-default").handler("", harness.ctx);
		await harness.triggerSettingsChange();
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "openai",
			defaultModel: "gpt",
			defaultThinkingLevel: "high",
			unrelated: { keep: true },
		});
		expect(harness.notifications.at(-1)?.[0]).toContain("Default saved: openai/gpt · thinking: high");
		expect(harness.notifications.at(-1)?.[0]).toContain("defaultModel");
		expect(harness.notifications.at(-1)?.[1]).toBe("info");

		await writeFile(globalPath, JSON.stringify({
			defaultProvider: "temporary",
			defaultModel: "temporary",
			defaultThinkingLevel: "low",
			unrelated: { keep: true },
		}));
		await harness.emit("model_select", { source: "set", model: harness.ctx.model });
		expect(await readSettings(globalPath)).toEqual({
			defaultProvider: "openai",
			defaultModel: "gpt",
			defaultThinkingLevel: "high",
			unrelated: { keep: true },
		});
	});

	test("missing or unauthenticated configured models and malformed global settings fail visibly and safely", async () => {
		const missing = await fixture({ defaultProvider: "no", defaultModel: "such" });
		const warning = createHarness(missing.globalPath);
		await warning.emit("session_start", { reason: "startup" });
		expect(warning.notifications.some(([message, level]) => level === "warning" && message.includes("unavailable"))).toBe(true);

		const unauthenticated = await fixture({ defaultProvider: "provider", defaultModel: "model" });
		const authWarning = createHarness(unauthenticated.globalPath, {
			models: [{ provider: "provider", id: "model" }],
			authenticated: false,
		});
		await authWarning.emit("session_start", { reason: "startup" });
		expect(authWarning.setModels).toEqual([]);
		expect(authWarning.notifications.some(([message, level]) => level === "warning" && message.includes("unavailable"))).toBe(true);

		const malformed = await fixture();
		await writeFile(malformed.globalPath, "not json");
		const failure = createHarness(malformed.globalPath);
		await failure.emit("session_start", { reason: "startup" });
		expect(failure.notifications.some(([message, level]) => level === "error" && message.includes("guard disabled"))).toBe(true);
		expect(failure.watchState().active).toBe(false);
		expect(await readFile(malformed.globalPath, "utf8")).toBe("not json");
	});

	test("rejects command arguments without changing settings", async () => {
		const { globalPath } = await fixture({ defaultProvider: "old", defaultModel: "old" });
		const harness = createHarness(globalPath);
		await harness.emit("session_start", { reason: "reload" });
		const before = await readFile(globalPath, "utf8");

		await harness.commands.get("set-model-default").handler("unexpected", harness.ctx);

		expect(await readFile(globalPath, "utf8")).toBe(before);
		expect(harness.notifications.at(-1)).toEqual(["Usage: /set-model-default", "error"]);
	});

	test("default export is the extension registrar", () => {
		expect(registerExtension).toBe(registerSessionModelDefaults);
	});
});
