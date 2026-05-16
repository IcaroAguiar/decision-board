import { calculatePortfolioSummary } from "@decision-board/core";
import type {
	PortfolioCashAccountInput,
	PortfolioPositionInput,
	RiskCategory,
	StrategyAlert,
} from "@decision-board/types";
import { reviewSeverities, strategyAlertCodes } from "@decision-board/types";

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

export type Strategy = StrategyDefinition;
export type StrategyRule = StrategyRules;
export type { StrategyAlert };

export interface StrategyEvaluationInput {
	positions: PortfolioPositionInput[];
	cashAccounts?: PortfolioCashAccountInput[];
}

export interface StrategyEvaluationResult {
	strategyId: StrategyDefinition["id"];
	totalValue: number;
	alerts: StrategyAlert[];
}

const PERCENT_SCALE = 100;
const PERCENT_ROUNDING_SCALE = 100;

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

export function evaluateStrategy(
	portfolio: StrategyEvaluationInput,
	strategy: StrategyDefinition,
): StrategyEvaluationResult {
	const summary = calculatePortfolioSummary(portfolio.positions, portfolio.cashAccounts ?? []);
	const alerts: StrategyAlert[] = [
		{
			code: strategyAlertCodes.reviewCadence,
			severity: reviewSeverities.info,
			message: `Review cadence: generate a strategy report every ${strategy.reportIntervalDays} days.`,
		},
	];

	if (summary.totalValue > 0) {
		addSingleAssetAlerts(alerts, portfolio.positions, summary.totalValue, strategy);
		addPaperHybridAlert(alerts, summary.allocationByRiskCategory, summary.totalValue, strategy);
		addMinimumBrickAlert(
			alerts,
			summary.allocationByRiskCategory.brick,
			summary.totalValue,
			strategy,
		);
		addMinimumCashAlert(
			alerts,
			summary.allocationByRiskCategory.cash,
			summary.totalValue,
			strategy,
		);
		addSectorAlerts(alerts, portfolio.positions, summary.totalValue, strategy);
	}

	addManualReviewAlert(alerts, strategy);
	addRiskChecklistAlert(alerts, strategy);

	return {
		strategyId: strategy.id,
		totalValue: summary.totalValue,
		alerts,
	};
}

function addSingleAssetAlerts(
	alerts: StrategyAlert[],
	positions: PortfolioPositionInput[],
	totalValue: number,
	strategy: StrategyDefinition,
): void {
	const limit = strategy.rules.maxSingleAssetPercent;
	if (limit === undefined) {
		return;
	}

	const offenders = positions
		.map((position) => ({
			ticker: position.ticker,
			percent: percentOf(position.quantity * position.currentPrice, totalValue),
		}))
		.filter((position) => position.percent > limit)
		.sort(compareByPercentThenLabel);

	for (const offender of offenders) {
		alerts.push({
			code: strategyAlertCodes.maxSingleAssetPercent,
			severity: reviewSeverities.alert,
			message: `${offender.ticker} is ${formatPercent(offender.percent)} of the portfolio, above the ${formatPercent(limit)} strategy limit.`,
		});
	}
}

function addPaperHybridAlert(
	alerts: StrategyAlert[],
	allocationByRiskCategory: Record<RiskCategory, number>,
	totalValue: number,
	strategy: StrategyDefinition,
): void {
	const limit = strategy.rules.maxPaperHybridPercent;
	if (limit === undefined) {
		return;
	}

	const paperHybridPercent = percentOf(
		allocationByRiskCategory.paper + allocationByRiskCategory.hybrid,
		totalValue,
	);

	if (paperHybridPercent > limit) {
		alerts.push({
			code: strategyAlertCodes.maxPaperHybridPercent,
			severity: reviewSeverities.warning,
			message: `Paper and hybrid exposure is ${formatPercent(paperHybridPercent)}, above the ${formatPercent(limit)} strategy limit.`,
		});
	}
}

function addMinimumBrickAlert(
	alerts: StrategyAlert[],
	brickValue: number,
	totalValue: number,
	strategy: StrategyDefinition,
): void {
	const minimum = strategy.rules.minBrickPercent;
	if (minimum === undefined) {
		return;
	}

	const brickPercent = percentOf(brickValue, totalValue);

	if (brickPercent < minimum) {
		alerts.push({
			code: strategyAlertCodes.minBrickPercent,
			severity: reviewSeverities.warning,
			message: `Brick exposure is ${formatPercent(brickPercent)}, below the ${formatPercent(minimum)} strategy minimum.`,
		});
	}
}

function addMinimumCashAlert(
	alerts: StrategyAlert[],
	cashValue: number,
	totalValue: number,
	strategy: StrategyDefinition,
): void {
	const minimum = strategy.rules.minCashPercent;
	if (minimum === undefined) {
		return;
	}

	const cashPercent = percentOf(cashValue, totalValue);

	if (cashPercent < minimum) {
		alerts.push({
			code: strategyAlertCodes.minCashPercent,
			severity: reviewSeverities.warning,
			message: `Cash allocation is ${formatPercent(cashPercent)}, below the ${formatPercent(minimum)} strategy minimum.`,
		});
	}
}

function addSectorAlerts(
	alerts: StrategyAlert[],
	positions: PortfolioPositionInput[],
	totalValue: number,
	strategy: StrategyDefinition,
): void {
	const limit = strategy.rules.maxSectorPercent;
	if (limit === undefined) {
		return;
	}

	const sectorValues = new Map<string, number>();
	for (const position of positions) {
		if (!position.segment) {
			continue;
		}

		sectorValues.set(
			position.segment,
			(sectorValues.get(position.segment) ?? 0) + position.quantity * position.currentPrice,
		);
	}

	const offenders = [...sectorValues.entries()]
		.map(([label, value]) => ({
			label,
			percent: percentOf(value, totalValue),
		}))
		.filter((sector) => sector.percent > limit)
		.sort(compareByPercentThenLabel);

	for (const offender of offenders) {
		alerts.push({
			code: strategyAlertCodes.maxSectorPercent,
			severity: reviewSeverities.warning,
			message: `${offender.label} exposure is ${formatPercent(offender.percent)}, above the ${formatPercent(limit)} strategy limit.`,
		});
	}
}

function addManualReviewAlert(alerts: StrategyAlert[], strategy: StrategyDefinition): void {
	if (!strategy.rules.requiresManualReviewBeforeBuy) {
		return;
	}

	alerts.push({
		code: strategyAlertCodes.manualReviewRequired,
		severity: reviewSeverities.priority,
		message: "Manual review is required before allocation changes under this strategy.",
	});
}

function addRiskChecklistAlert(alerts: StrategyAlert[], strategy: StrategyDefinition): void {
	if (!strategy.rules.requiresRiskChecklist) {
		return;
	}

	alerts.push({
		code: strategyAlertCodes.riskChecklistRequired,
		severity: reviewSeverities.priority,
		message: "Complete the risk checklist before changing exposure under this strategy.",
	});
}

function percentOf(value: number, totalValue: number): number {
	if (totalValue <= 0) {
		return 0;
	}

	return (value / totalValue) * PERCENT_SCALE;
}

function formatPercent(value: number): string {
	return `${roundPercent(value)}%`;
}

function roundPercent(value: number): number {
	return Math.round(value * PERCENT_ROUNDING_SCALE) / PERCENT_ROUNDING_SCALE;
}

function compareByPercentThenLabel(
	left: { percent: number; ticker?: string; label?: string },
	right: { percent: number; ticker?: string; label?: string },
): number {
	const percentDifference = right.percent - left.percent;
	if (percentDifference !== 0) {
		return percentDifference;
	}

	return (left.ticker ?? left.label ?? "").localeCompare(right.ticker ?? right.label ?? "");
}
