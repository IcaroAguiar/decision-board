import type { AnalysisRef } from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
import { validateAllocationTarget } from "../contribution-allocation.js";
import { approxEqual, type PortfolioPart, portfolioParts } from "../units.js";

export interface PartStrategyPreference {
	role: string;
	target: number;
	band: { min: number; max: number };
	horizonMonths: number | null;
}

export interface StrategyPreferences {
	parts: Record<PortfolioPart, PartStrategyPreference>;
	maxFixedIncomeTermMonths: number | null;
	prefersMonthlyReinvestableIncome: boolean;
	allowedInstitutionsByAssetClass: Record<string, readonly string[]>;
	reserve: {
		ceiling: number | null;
		annualRate: number | null;
		validFrom: string | null;
	};
	monthlyCash: {
		contribution: number;
		receiptDay: number;
		slack: number;
		goalShare: number;
		reminderEnabled: boolean;
	};
}

export interface StrategyVersion {
	strategyId: string;
	version: number;
	effectiveFrom: string;
	preferences: StrategyPreferences;
}

export type StrategyAnalysisMatch = "current" | "previous" | "notTied";

export interface ClassifiedAnalysis {
	ref: AnalysisRef;
	classification: StrategyAnalysisMatch;
}

export interface StrategyRevisionResult {
	changed: boolean;
	version: StrategyVersion;
	changedFields: string[];
}

const knownPartSet = new Set<string>(portfolioParts);

function assertNonNegativeFinite(value: number, label: string): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${label}: informe um valor finito não negativo.`);
	}
}

function assertPositiveIntegerOrNull(value: number | null, label: string): void {
	if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
		throw new Error(`${label}: informe um inteiro positivo ou nulo.`);
	}
}

function validatePreferences(preferences: StrategyPreferences): void {
	for (const key of Object.keys(preferences.parts)) {
		if (!knownPartSet.has(key)) {
			throw new Error(`Parte da carteira desconhecida: ${key}.`);
		}
	}
	let targetSum = 0;
	for (const part of portfolioParts) {
		const partPreference = preferences.parts[part];
		if (!partPreference || !partPreference.role.trim()) {
			throw new Error(`Informe a função da parte ${part}.`);
		}
		validateAllocationTarget({ target: partPreference.target, band: partPreference.band });
		assertPositiveIntegerOrNull(partPreference.horizonMonths, `parts.${part}.horizonMonths`);
		targetSum += partPreference.target;
	}
	if (!approxEqual(targetSum, 1)) {
		throw new Error("Os alvos das partes da carteira devem somar 1.");
	}
	assertPositiveIntegerOrNull(preferences.maxFixedIncomeTermMonths, "maxFixedIncomeTermMonths");
	for (const [assetClass, institutions] of Object.entries(
		preferences.allowedInstitutionsByAssetClass,
	)) {
		if (!assetClass.trim()) {
			throw new Error("Classe de ativo inválida nas instituições permitidas.");
		}
		if (institutions.some((institution) => !institution.trim())) {
			throw new Error("Informe nomes válidos para as instituições permitidas.");
		}
	}
	if (preferences.reserve.ceiling !== null) {
		assertNonNegativeFinite(preferences.reserve.ceiling, "reserve.ceiling");
	}
	if (preferences.reserve.annualRate !== null) {
		assertNonNegativeFinite(preferences.reserve.annualRate, "reserve.annualRate");
	}
	if (preferences.reserve.validFrom !== null) {
		parseIsoDate(preferences.reserve.validFrom);
	}
	assertNonNegativeFinite(preferences.monthlyCash.contribution, "monthlyCash.contribution");
	assertNonNegativeFinite(preferences.monthlyCash.slack, "monthlyCash.slack");
	if (
		!Number.isSafeInteger(preferences.monthlyCash.receiptDay) ||
		preferences.monthlyCash.receiptDay < 1 ||
		preferences.monthlyCash.receiptDay > 28
	) {
		throw new Error("O dia de recebimento deve ser um inteiro entre 1 e 28.");
	}
	if (
		!Number.isFinite(preferences.monthlyCash.goalShare) ||
		preferences.monthlyCash.goalShare < 0 ||
		preferences.monthlyCash.goalShare > 1
	) {
		throw new Error("A fatia da Meta deve ser uma fração decimal entre 0 e 1.");
	}
}

function clonePreferences(preferences: StrategyPreferences): StrategyPreferences {
	return {
		parts: {
			reserve: {
				...preferences.parts.reserve,
				band: { ...preferences.parts.reserve.band },
			},
			goal: {
				...preferences.parts.goal,
				band: { ...preferences.parts.goal.band },
			},
			variableIncome: {
				...preferences.parts.variableIncome,
				band: { ...preferences.parts.variableIncome.band },
			},
		},
		maxFixedIncomeTermMonths: preferences.maxFixedIncomeTermMonths,
		prefersMonthlyReinvestableIncome: preferences.prefersMonthlyReinvestableIncome,
		allowedInstitutionsByAssetClass: Object.fromEntries(
			Object.entries(preferences.allowedInstitutionsByAssetClass).map(
				([assetClass, institutions]) => [assetClass, [...institutions]],
			),
		),
		reserve: { ...preferences.reserve },
		monthlyCash: { ...preferences.monthlyCash },
	};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValues(current: unknown, next: unknown, prefix: string, changed: string[]): void {
	if (Array.isArray(current) && Array.isArray(next)) {
		const equal =
			current.length === next.length && current.every((item, index) => item === next[index]);
		if (!equal) {
			changed.push(prefix);
		}
		return;
	}
	if (isPlainRecord(current) && isPlainRecord(next)) {
		const keys = [...new Set([...Object.keys(current), ...Object.keys(next)])].sort();
		for (const key of keys) {
			const path = prefix ? `${prefix}.${key}` : key;
			if (!(key in current) || !(key in next)) {
				changed.push(path);
			} else {
				diffValues(current[key], next[key], path, changed);
			}
		}
		return;
	}
	if (current !== next) {
		changed.push(prefix);
	}
}

export function createStrategy(
	strategyId: string,
	preferences: StrategyPreferences,
	effectiveFrom: string,
): StrategyVersion {
	if (!strategyId.trim()) {
		throw new Error("Informe o identificador da estratégia.");
	}
	parseIsoDate(effectiveFrom);
	validatePreferences(preferences);
	return {
		strategyId,
		version: 1,
		effectiveFrom,
		preferences: clonePreferences(preferences),
	};
}

export function reviseStrategy(
	current: StrategyVersion,
	nextPreferences: StrategyPreferences,
	effectiveFrom: string,
): StrategyRevisionResult {
	if (!current.strategyId.trim() || !Number.isSafeInteger(current.version) || current.version < 1) {
		throw new Error("Versão atual da estratégia inválida.");
	}
	parseIsoDate(current.effectiveFrom);
	validatePreferences(current.preferences);
	parseIsoDate(effectiveFrom);
	if (effectiveFrom < current.effectiveFrom) {
		throw new Error("A data de vigência da revisão não pode ser anterior à versão atual.");
	}
	validatePreferences(nextPreferences);
	const changedFields: string[] = [];
	diffValues(current.preferences, nextPreferences, "", changedFields);
	if (changedFields.length === 0) {
		return { changed: false, version: current, changedFields: [] };
	}
	return {
		changed: true,
		version: {
			strategyId: current.strategyId,
			version: current.version + 1,
			effectiveFrom,
			preferences: clonePreferences(nextPreferences),
		},
		changedFields,
	};
}

export function versionLabel(version: StrategyVersion): string {
	return `${version.strategyId}@${version.version}`;
}

export function classifyAnalysesByStrategy(
	refs: readonly AnalysisRef[],
	current: StrategyVersion,
): ClassifiedAnalysis[] {
	const currentLabel = versionLabel(current);
	return refs.map((ref) => ({
		ref,
		classification:
			ref.strategyVersion === null
				? "notTied"
				: ref.strategyVersion === currentLabel
					? "current"
					: "previous",
	}));
}
