import {
	type AnalysisRef,
	addMonths,
	createMonthlySeries,
	createStrategy,
	known,
	type MonthlySeries,
	methodIds,
	type OperationPlanItem,
	type Proposal,
	type SourceRef,
	type StrategyPreferences,
	type StrategyVersion,
} from "../index.js";

export function buildPreferences(): StrategyPreferences {
	return {
		parts: {
			reserve: {
				role: "Liquidez e proteção",
				target: 0.2,
				band: { min: 0.15, max: 0.25 },
				horizonMonths: 12,
			},
			goal: {
				role: "Objetivo de médio prazo",
				target: 0.5,
				band: { min: 0.45, max: 0.55 },
				horizonMonths: 36,
			},
			variableIncome: {
				role: "Crescimento e renda",
				target: 0.3,
				band: { min: 0.25, max: 0.35 },
				horizonMonths: null,
			},
		},
		maxFixedIncomeTermMonths: 60,
		prefersMonthlyReinvestableIncome: true,
		allowedInstitutionsByAssetClass: {
			fixedIncome: ["Corretora Alfa", "Banco Beta"],
			fii: ["Corretora Alfa"],
		},
		reserve: {
			ceiling: 30_000,
			annualRate: 0.105,
			validFrom: "2026-01-01",
		},
		monthlyCash: {
			contribution: 2_500,
			receiptDay: 5,
			slack: 300,
			goalShare: 0.6,
			reminderEnabled: true,
		},
	};
}

export function buildStrategy(effectiveFrom = "2026-01-01"): StrategyVersion {
	return createStrategy("estrategia-principal", buildPreferences(), effectiveFrom);
}

export function makeRef(overrides: Partial<AnalysisRef> = {}): AnalysisRef {
	return {
		id: "ana-r7-1",
		method: { id: methodIds.allocationVsTarget, version: "1.0.0" },
		asOf: "2026-02-01",
		status: "complete",
		strategyVersion: "estrategia-principal@1",
		subjects: [],
		...overrides,
	};
}

export function makeItem(overrides: Partial<OperationPlanItem> = {}): OperationPlanItem {
	return {
		assetId: "asset-fii-1",
		ticker: "XPLG11",
		part: "variableIncome",
		assetClass: "fii",
		direction: "allocate",
		quantity: 10,
		referencePrice: 100,
		...overrides,
	};
}

export function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
	return {
		id: "prop-2026-02",
		kind: "contribution",
		items: [makeItem()],
		analyses: [makeRef()],
		justifications: [],
		claims: [],
		...overrides,
	};
}

export const syntheticSource: SourceRef = {
	id: "b3-synthetic",
	label: "Série sintética determinística",
	asOf: "2026-02-01",
	official: false,
};

export function buildSyntheticSeries(endMonth: string, values: readonly number[]): MonthlySeries {
	const startMonth = addMonths(endMonth, 1 - values.length);
	return createMonthlySeries(
		values.map((value, monthIndex) => ({
			month: addMonths(startMonth, monthIndex),
			value: known(value, "observed", syntheticSource),
		})),
	);
}
