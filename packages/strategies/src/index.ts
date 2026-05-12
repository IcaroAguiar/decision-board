export interface StrategyRules {
	maxSingleAssetPercent?: number;
	maxPaperHybridPercent?: number;
	minBrickPercent?: number;
	maxSectorPercent?: number;
	minCashPercent?: number;
	requiresManualReviewBeforeBuy?: boolean;
	requiresRiskChecklist?: boolean;
}

export interface StrategyDefinition {
	id: "low_maintenance" | "high_income" | "balanced_growth" | "opportunistic" | "defensive";
	name: string;
	riskLevel: "low" | "low_medium" | "medium" | "moderate_high" | "high";
	reportIntervalDays: number;
	rules: StrategyRules;
}

export const strategies: StrategyDefinition[] = [
	{
		id: "low_maintenance",
		name: "Pouca manutenção",
		riskLevel: "low_medium",
		reportIntervalDays: 30,
		rules: {
			maxSingleAssetPercent: 25,
			maxPaperHybridPercent: 30,
			minBrickPercent: 60,
			maxSectorPercent: 45,
			requiresManualReviewBeforeBuy: false,
		},
	},
	{
		id: "high_income",
		name: "Renda mensal alta",
		riskLevel: "moderate_high",
		reportIntervalDays: 15,
		rules: {
			maxSingleAssetPercent: 20,
			maxPaperHybridPercent: 50,
			requiresManualReviewBeforeBuy: true,
		},
	},
	{
		id: "balanced_growth",
		name: "Crescimento equilibrado",
		riskLevel: "medium",
		reportIntervalDays: 30,
		rules: {
			maxSingleAssetPercent: 22,
			maxPaperHybridPercent: 35,
			maxSectorPercent: 40,
			minCashPercent: 0,
		},
	},
	{
		id: "opportunistic",
		name: "Oportunista",
		riskLevel: "high",
		reportIntervalDays: 7,
		rules: {
			maxSingleAssetPercent: 15,
			minCashPercent: 10,
			requiresManualReviewBeforeBuy: true,
			requiresRiskChecklist: true,
		},
	},
	{
		id: "defensive",
		name: "Defensiva",
		riskLevel: "low",
		reportIntervalDays: 30,
		rules: {
			maxSingleAssetPercent: 20,
			maxPaperHybridPercent: 20,
			minCashPercent: 10,
		},
	},
];

export function getStrategyById(id: StrategyDefinition["id"]): StrategyDefinition {
	const strategy = strategies.find((candidate) => candidate.id === id);

	if (!strategy) {
		throw new Error(`Unknown strategy: ${id}`);
	}

	return strategy;
}
