import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	closeSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	watch,
	writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const GUARDED_FIELDS = ["defaultProvider", "defaultModel", "defaultThinkingLevel"] as const;
type GuardedField = (typeof GUARDED_FIELDS)[number];
export type Settings = Record<string, unknown>;
export type GuardedSnapshot = Record<GuardedField, { present: boolean; value?: unknown }>;

type UiContext = Pick<ExtensionContext, "ui">;
type RuntimeContext = ExtensionContext;

type SettingsFileChangeListener = () => void | Promise<void>;
type WatchSettingsFile = (
	path: string,
	options: { persistent: false },
	listener: SettingsFileChangeListener,
) => void | (() => void);
type UnwatchSettingsFile = (path: string, listener: SettingsFileChangeListener) => void;

export interface ExtensionDependencies {
	globalSettingsPath?: string;
	argv?: readonly string[];
	yieldForPiWrite?: () => Promise<void>;
	watchSettingsFile?: WatchSettingsFile;
	unwatchSettingsFile?: UnwatchSettingsFile;
}

function isObject(value: unknown): value is Settings {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readSettings(path: string): Promise<Settings> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
	const parsed: unknown = JSON.parse(text);
	if (!isObject(parsed)) throw new Error("settings JSON must contain an object");
	return parsed;
}

export function captureGuarded(settings: Settings): GuardedSnapshot {
	return Object.fromEntries(GUARDED_FIELDS.map((field) => [
		field,
		Object.prototype.hasOwnProperty.call(settings, field)
			? { present: true, value: settings[field] }
			: { present: false },
	])) as GuardedSnapshot;
}

export function restoreGuarded(settings: Settings, snapshot: GuardedSnapshot): Settings {
	const restored = { ...settings };
	for (const field of GUARDED_FIELDS) {
		const accepted = snapshot[field];
		if (accepted.present) restored[field] = accepted.value;
		else delete restored[field];
	}
	return restored;
}

function guardedFieldsMatch(settings: Settings, snapshot: GuardedSnapshot): boolean {
	for (const field of GUARDED_FIELDS) {
		const present = Object.prototype.hasOwnProperty.call(settings, field);
		const accepted = snapshot[field];
		if (present !== accepted.present) return false;
		if (present && !isDeepStrictEqual(settings[field], accepted.value)) return false;
	}
	return true;
}

export function mergeEffectiveDefaults(global: Settings, project?: Settings): Settings {
	const effective = { ...global };
	if (project) {
		for (const field of GUARDED_FIELDS) {
			if (Object.prototype.hasOwnProperty.call(project, field)) effective[field] = project[field];
		}
	}
	return effective;
}

export function hasExplicitModelArg(argv: readonly string[]): boolean {
	return argv.some((arg, index) =>
		(arg === "--model" && index + 1 < argv.length && !argv[index + 1]!.startsWith("-")) ||
		(arg.startsWith("--model=") && arg.length > "--model=".length));
}

interface AtomicTarget {
	path: string;
	symlinkPath?: string;
}

function atomicTargetSync(path: string): AtomicTarget {
	try {
		const info = lstatSync(path);
		if (info.isSymbolicLink()) {
			try {
				return { path: realpathSync(path), symlinkPath: path };
			} catch {
				const link = readlinkSync(path);
				return {
					path: isAbsolute(link) ? link : resolve(dirname(path), link),
					symlinkPath: path,
				};
			}
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	return { path };
}

function verifySymlinkTargetSync(target: AtomicTarget): void {
	if (!target.symlinkPath) return;
	let currentTarget: string;
	try {
		currentTarget = realpathSync(target.symlinkPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		const link = readlinkSync(target.symlinkPath);
		currentTarget = isAbsolute(link) ? link : resolve(dirname(target.symlinkPath), link);
	}
	if (currentTarget !== target.path) {
		throw new Error(`settings symlink target changed during save: ${target.symlinkPath}`);
	}
}

function syncDirectorySync(path: string): void {
	let descriptor: number | undefined;
	try {
		descriptor = openSync(path, "r");
		fsyncSync(descriptor);
	} catch {
		// The file is already safely renamed; some platforms cannot fsync directories.
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
}

function atomicWriteSettingsSync(path: string, settings: Settings): void {
	const target = atomicTargetSync(path);
	const targetDirectory = dirname(target.path);
	mkdirSync(targetDirectory, { recursive: true });
	let mode = 0o600;
	try {
		mode = statSync(target.path).mode & 0o777;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	const temporary = join(targetDirectory, `.${randomUUID()}.session-model-defaults.tmp`);
	let descriptor: number | undefined;
	try {
		descriptor = openSync(temporary, "wx", mode);
		writeFileSync(descriptor, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
		verifySymlinkTargetSync(target);
		renameSync(temporary, target.path);
		syncDirectorySync(targetDirectory);
	} catch (error) {
		if (descriptor !== undefined) closeSync(descriptor);
		try { unlinkSync(temporary); } catch { /* Best-effort cleanup. */ }
		throw error;
	}
}

export async function atomicWriteSettings(path: string, settings: Settings): Promise<void> {
	atomicWriteSettingsSync(path, settings);
}

function sleepSync(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Pi 0.81.x uses the same mkdir lock and performs its entire settings update
 * synchronously. Keep our read/merge/atomic-write synchronous too: yielding while
 * owning this lock lets Pi exhaust its synchronous ELOCKED retries and lose a write.
 */
function withSettingsLockSync<T>(path: string, operation: () => T): T {
	mkdirSync(dirname(path), { recursive: true });
	const lockPath = `${path}.lock`;
	for (let attempt = 1; ; attempt++) {
		try {
			mkdirSync(lockPath);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 100) throw error;
			sleepSync(10);
		}
	}
	try {
		return operation();
	} finally {
		rmSync(lockPath, { recursive: true, force: true });
	}
}

function readSettingsSync(path: string): Settings {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
	const parsed: unknown = JSON.parse(text);
	if (!isObject(parsed)) throw new Error("settings JSON must contain an object");
	return parsed;
}

export async function updateSettings(
	path: string,
	update: (current: Settings) => Settings,
): Promise<Settings> {
	return withSettingsLockSync(path, () => {
		const current = readSettingsSync(path);
		const next = update(current);
		if (!isObject(next)) throw new Error("settings update must produce an object");
		if (JSON.stringify(current) !== JSON.stringify(next)) atomicWriteSettingsSync(path, next);
		return next;
	});
}

export async function restoreGuardedFile(path: string, snapshot: GuardedSnapshot): Promise<Settings> {
	return updateSettings(path, (current) => restoreGuarded(current, snapshot));
}

export class SerializedSettingsGuard {
	private queue: Promise<void> = Promise.resolve();
	private snapshot?: GuardedSnapshot;
	private readonly yieldForPiWrite: () => Promise<void>;

	constructor(private readonly path: string, yieldForPiWrite = () => new Promise<void>((done) => setTimeout(done, 0))) {
		this.yieldForPiWrite = yieldForPiWrite;
	}

	initialize(): Promise<void> {
		return this.enqueue(async () => {
			this.snapshot = undefined;
			const settings = await readSettings(this.path);
			this.snapshot = captureGuarded(settings);
		});
	}

	get enabled(): boolean { return this.snapshot !== undefined; }

	/** Wait for every operation queued so far, even when an earlier operation failed. */
	async drain(): Promise<void> {
		await this.queue;
	}

	restoreAfterPiWrite(): Promise<void> {
		return this.enqueue(async () => {
			await this.yieldForPiWrite();
			await this.reconcileNow();
		});
	}

	reconcile(): Promise<void> {
		return this.enqueue(() => this.reconcileNow());
	}

	save(values: Record<GuardedField, unknown>): Promise<Settings> {
		return this.enqueue(async () => {
			const saved = await updateSettings(this.path, (current) => ({ ...current, ...values }));
			this.snapshot = captureGuarded(saved);
			return saved;
		});
	}

	private async reconcileNow(): Promise<void> {
		if (!this.snapshot) throw new Error("persistence guard is disabled because global settings could not be loaded");
		const snapshot = this.snapshot;
		await updateSettings(this.path, (current) => {
			if (guardedFieldsMatch(current, snapshot)) return current;
			return restoreGuarded(current, snapshot);
		});
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.queue.then(operation);
		this.queue = result.then(() => undefined, () => undefined);
		return result;
	}
}

async function loadEffectiveSettings(globalPath: string, ctx: RuntimeContext): Promise<{
	effective: Settings;
	project?: Settings;
	projectError?: unknown;
}> {
	const global = await readSettings(globalPath);
	if (!ctx.isProjectTrusted()) return { effective: global };
	const projectPath = join(ctx.cwd, CONFIG_DIR_NAME, "settings.json");
	try {
		const project = await readSettings(projectPath);
		return { effective: mergeEffectiveDefaults(global, project), project };
	} catch (projectError) {
		return { effective: global, projectError };
	}
}

function notifyError(ctx: UiContext, prefix: string, error: unknown): void {
	const detail = error instanceof Error ? error.message : String(error);
	ctx.ui.notify(`${prefix}: ${detail}`, "error");
}

function projectOverrideFields(project?: Settings): GuardedField[] {
	return project ? GUARDED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(project, field)) : [];
}

async function modelIsUsable(ctx: RuntimeContext, provider: string, modelId: string): Promise<unknown | undefined> {
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) return undefined;
	try {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		return auth.ok ? model : undefined;
	} catch {
		return undefined;
	}
}

export function registerSessionModelDefaults(pi: ExtensionAPI, dependencies: ExtensionDependencies = {}): void {
	const globalPath = dependencies.globalSettingsPath ?? join(getAgentDir(), "settings.json");
	const argv = dependencies.argv ?? process.argv.slice(2);
	const guard = new SerializedSettingsGuard(globalPath, dependencies.yieldForPiWrite);
	const startWatching = dependencies.watchSettingsFile ?? ((path, options, listener) => {
		const target = atomicTargetSync(path).path;
		const watchedFiles = new Map<string, Set<string>>();
		for (const watchedPath of new Set([path, target])) {
			const directory = dirname(watchedPath);
			const names = watchedFiles.get(directory) ?? new Set<string>();
			names.add(basename(watchedPath));
			watchedFiles.set(directory, names);
		}
		const watchers: ReturnType<typeof watch>[] = [];
		let renameTimer: ReturnType<typeof setTimeout> | undefined;
		try {
			for (const [directory, names] of watchedFiles) {
				// Directory watches survive atomic replacement of the file inode.
				mkdirSync(directory, { recursive: true });
				watchers.push(watch(directory, options, (eventType, filename) => {
					if (eventType === "rename") {
						// Some runtimes report only the temporary source name, and may
						// report its creation before the replacement rename has completed.
						if (renameTimer) clearTimeout(renameTimer);
						renameTimer = setTimeout(() => void listener(), 10);
					} else if (filename === null || names.has(filename.toString())) {
						void listener();
					}
				}));
			}
		} catch (error) {
			for (const watcher of watchers) watcher.close();
			throw error;
		}
		return () => {
			if (renameTimer) clearTimeout(renameTimer);
			for (const watcher of watchers) watcher.close();
		};
	});
	const stopWatching = dependencies.unwatchSettingsFile;
	let guardErrorReported = false;
	let watchContext: UiContext | undefined;
	let settingsChangeListener: SettingsFileChangeListener | undefined;
	let closeSettingsWatcher: (() => void) | undefined;

	const reportGuardFailure = (ctx: UiContext, error: unknown) => {
		notifyError(ctx, "Could not restore model defaults", error);
	};
	const startReconciliationWatcher = (ctx: UiContext) => {
		watchContext = ctx;
		if (settingsChangeListener) return;
		const listener: SettingsFileChangeListener = async () => {
			const currentContext = watchContext;
			if (!currentContext) return;
			try {
				await guard.reconcile();
			} catch (error) {
				reportGuardFailure(currentContext, error);
			}
		};
		const close = startWatching(globalPath, { persistent: false }, listener);
		closeSettingsWatcher = typeof close === "function" ? close : undefined;
		settingsChangeListener = listener;
	};
	const stopReconciliationWatcher = () => {
		const listener = settingsChangeListener;
		settingsChangeListener = undefined;
		watchContext = undefined;
		const close = closeSettingsWatcher;
		closeSettingsWatcher = undefined;
		if (close) close();
		else if (listener) stopWatching?.(globalPath, listener);
	};

	pi.on("session_start", async (event, ctx) => {
		try {
			await guard.initialize();
			guardErrorReported = false;
		} catch (error) {
			try {
				stopReconciliationWatcher();
			} catch (stopError) {
				notifyError(ctx, "Could not stop model-default watcher", stopError);
			}
			if (!guardErrorReported) notifyError(ctx, "Session model-default guard disabled", error);
			guardErrorReported = true;
		}
		if (guard.enabled) {
			try {
				startReconciliationWatcher(ctx);
			} catch (error) {
				watchContext = undefined;
				notifyError(ctx, "Could not watch model-default settings", error);
			}
		}
		if (event.reason === "reload" || event.reason === "startup" && hasExplicitModelArg(argv)) return;

		let loaded: Awaited<ReturnType<typeof loadEffectiveSettings>>;
		try {
			loaded = await loadEffectiveSettings(globalPath, ctx);
		} catch (error) {
			notifyError(ctx, "Could not load effective model defaults", error);
			return;
		}
		if (loaded.projectError) {
			const detail = loaded.projectError instanceof Error ? loaded.projectError.message : String(loaded.projectError);
			ctx.ui.notify(`Ignoring malformed project model defaults: ${detail}`, "warning");
		}
		const hasProvider = Object.prototype.hasOwnProperty.call(loaded.effective, "defaultProvider");
		const hasModel = Object.prototype.hasOwnProperty.call(loaded.effective, "defaultModel");
		const provider = typeof loaded.effective.defaultProvider === "string" && loaded.effective.defaultProvider.length > 0
			? loaded.effective.defaultProvider
			: undefined;
		const modelId = typeof loaded.effective.defaultModel === "string" && loaded.effective.defaultModel.length > 0
			? loaded.effective.defaultModel
			: undefined;
		if (hasProvider || hasModel) {
			if (!provider || !modelId) {
				const problem = !provider && !modelId
					? "defaultProvider and defaultModel must be non-empty strings"
					: !provider
						? "defaultProvider must be a non-empty string"
						: "defaultModel must be a non-empty string";
				ctx.ui.notify(`Configured model default is invalid or incomplete: ${problem}; keeping current model`, "warning");
			}
		}
		if (provider && modelId && (ctx.model?.provider !== provider || ctx.model?.id !== modelId)) {
			const model = await modelIsUsable(ctx, provider, modelId);
			if (!model) {
				ctx.ui.notify(`Configured default unavailable: ${provider}/${modelId}; keeping current model`, "warning");
			} else {
				const changed = await pi.setModel(model as Parameters<ExtensionAPI["setModel"]>[0]);
				if (!changed) ctx.ui.notify(`Configured default unavailable: ${provider}/${modelId}; keeping current model`, "warning");
			}
		}
		const thinking = loaded.effective.defaultThinkingLevel;
		const validThinking = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
		if (typeof thinking === "string" && validThinking.has(thinking) && thinking !== pi.getThinkingLevel()) {
			pi.setThinkingLevel(thinking as ReturnType<ExtensionAPI["getThinkingLevel"]>);
		} else if (thinking !== undefined && (typeof thinking !== "string" || !validThinking.has(thinking))) {
			ctx.ui.notify(`Configured default thinking level is invalid: ${String(thinking)}; keeping current level`, "warning");
		}
	});

	pi.on("model_select", async (event, ctx) => {
		if (event.source !== "set" && event.source !== "cycle") return;
		try { await guard.restoreAfterPiWrite(); } catch (error) { reportGuardFailure(ctx, error); }
	});

	pi.on("thinking_level_select", async (_event, ctx) => {
		try { await guard.restoreAfterPiWrite(); } catch (error) { reportGuardFailure(ctx, error); }
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		try {
			stopReconciliationWatcher();
		} catch (error) {
			notifyError(ctx, "Could not stop model-default watcher", error);
		}
		if (guard.enabled) {
			try { await guard.reconcile(); } catch (error) { reportGuardFailure(ctx, error); }
		}
		try { await guard.drain(); } catch (error) { reportGuardFailure(ctx, error); }
	});

	pi.registerCommand("set-model-default", {
		description: "Save the active model and thinking level as global defaults",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /set-model-default", "error");
				return;
			}
			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("Cannot save default: no active model", "error");
				return;
			}
			const thinking = pi.getThinkingLevel();
			try {
				await guard.save({
					defaultProvider: model.provider,
					defaultModel: model.id,
					defaultThinkingLevel: thinking,
				});
			} catch (error) {
				notifyError(ctx, "Could not save model default", error);
				return;
			}

			let suffix = "";
			if (ctx.isProjectTrusted()) {
				try {
					const project = await readSettings(join(ctx.cwd, CONFIG_DIR_NAME, "settings.json"));
					const overrides = projectOverrideFields(project);
					if (overrides.length > 0) suffix = ` · project overrides remain active: ${overrides.join(", ")}`;
				} catch {
					suffix = " · warning: project settings could not be checked";
				}
			}
			ctx.ui.notify(`Default saved: ${model.provider}/${model.id} · thinking: ${thinking}${suffix}`, "info");
		},
	});
}

export default registerSessionModelDefaults;
