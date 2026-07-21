export type ModelSelectionSource = "override" | "profile" | "parent";

export interface ModelSelection {
	qualified: string;
	provider: string;
	modelId: string;
	source: ModelSelectionSource;
}

export interface ModelSelectionInput {
	override?: string;
	profile?: string;
	parent?: {
		provider?: string;
		id?: string;
	};
}

interface ModelRegistryLike<TModel> {
	find(provider: string, modelId: string): TModel | undefined;
	getApiKeyAndHeaders(model: TModel): Promise<{ ok: boolean }>;
}

function parseQualified(value: string, source: "override" | "profile"): ModelSelection {
	const qualified = value.trim();
	const separator = qualified.indexOf("/");
	if (separator < 1 || separator === qualified.length - 1) {
		throw new Error(
			`Invalid ${source} model ${JSON.stringify(value)}: expected provider/model with a non-empty provider and model ID`,
		);
	}

	return {
		qualified,
		provider: qualified.slice(0, separator),
		modelId: qualified.slice(separator + 1),
		source,
	};
}

export async function preflightModel<TModel>(
	input: ModelSelectionInput,
	registry: ModelRegistryLike<TModel>,
): Promise<ModelSelection> {
	const selection = selectModel(input);
	const model = registry.find(selection.provider, selection.modelId);
	if (!model) {
		throw new Error(
			`Unknown ${selection.source} model ${JSON.stringify(selection.qualified)}: no exact registry match`,
		);
	}

	const authError =
		`Authentication unavailable for ${selection.source} model ${JSON.stringify(selection.qualified)}; ` +
		`configure credentials for provider ${JSON.stringify(selection.provider)} and retry`;
	let auth: { ok: boolean };
	try {
		auth = await registry.getApiKeyAndHeaders(model);
	} catch {
		throw new Error(authError);
	}
	if (!auth.ok) {
		throw new Error(authError);
	}

	return selection;
}

export function selectModel(input: ModelSelectionInput): ModelSelection {
	if (input.override !== undefined) {
		return parseQualified(input.override, "override");
	}

	if (input.profile !== undefined) {
		return parseQualified(input.profile, "profile");
	}

	if (input.parent?.provider?.trim() && input.parent.id?.trim()) {
		return {
			qualified: `${input.parent.provider}/${input.parent.id}`,
			provider: input.parent.provider,
			modelId: input.parent.id,
			source: "parent",
		};
	}

	throw new Error(
		"Cannot select subagent model: current parent provider/model is unavailable; provide a qualified override or profile model",
	);
}
