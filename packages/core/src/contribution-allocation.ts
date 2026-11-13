import type {
	PortfolioCashAccountInput,
	PortfolioPositionInput,
	RiskCategory,
} from "@decision-board/types";
import { calculatePortfolioSummary, calculatePositionValue } from "./portfolio.js";

export type ContributionCandidateMetric =
	| "price"
	| "lotSize"
	| "targetWeightPercent"
	| "riskCategory"
	| "segment"
	| "dailyLiquidity"
	| "concentrationPercent";

export interface MetricSourceRef {
	metric: ContributionCandidateMetric;
	label: string;
	url?: string;
	capturedAt?: string;
}

export interface ContributionCandidateInput {
	assetId: string;
	ticker: string;
	currentPrice: number;
	riskCategory: RiskCategory;
	segment?: string;
	targetWeightPercent?: number;
	maxPrice?: number;
	lotSize?: number;
	priority?: number;
	dailyLiquidity?: number;
	concentrationPercent?: number;
	estimatedMonthlyDividendPerUnit?: number;
	metricSourceRefs: MetricSourceRef[];
}

export interface ContributionAllocationConstraints {
	maxSingleAssetPercent?: number;
	maxSegmentPercent?: number;
	maxRiskCategoryPercent?: Partial<Record<RiskCategory, number>>;
	minDailyLiquidity?: number;
	maxConcentrationPercent?: number;
}

export interface ContributionAllocationInput {
	positions: PortfolioPositionInput[];
	cashAccounts?: PortfolioCashAccountInput[];
	contributionAmount: number;
	allowedAssetIds: string[];
	candidates: ContributionCandidateInput[];
	constraints?: ContributionAllocationConstraints;
}

export interface SimulatedContributionOrder {
	assetId: string;
	ticker: string;
	quantity: number;
	limitPrice: number;
	estimatedValue: number;
	estimatedMonthlyDividend?: number;
	metricSourceRefs: MetricSourceRef[];
}

export type SimulationAuditSeverity = "info" | "warning" | "blocked";

export interface SimulationAuditFinding {
	code:
		| "candidate_outside_universe"
		| "missing_metric_source"
		| "price_above_limit"
		| "liquidity_below_minimum"
		| "concentration_above_limit"
		| "allocation_limit_reached"
		| "cash_unallocated";
	severity: SimulationAuditSeverity;
	ticker?: string;
	metric?: ContributionCandidateMetric;
	message: string;
}

export interface AuditableContributionSimulation {
	contributionAmount: number;
	investedAmount: number;
	remainingCash: number;
	orders: SimulatedContributionOrder[];
	auditFindings: SimulationAuditFinding[];
	postAllocation: {
		totalValue: number;
		byAsset: Record<string, number>;
		byRiskCategory: Record<RiskCategory, number>;
		bySegment: Record<string, number>;
	};
}

interface CandidateState {
	candidate: ContributionCandidateInput;
	blocked: boolean;
	blockReasons: SimulationAuditFinding[];
	quantity: number;
	investedAmount: number;
}

interface CandidateScore {
	state: CandidateState;
	targetGapImprovement: number;
	priority: number;
	lotValue: number;
}

interface CurrentValues {
	byAsset: Map<string, number>;
	byRiskCategory: Map<RiskCategory, number>;
	bySegment: Map<string, number>;
}

const MONEY_SCALE = 100;
const PERCENT_SCALE = 100;
const DEFAULT_LOT_SIZE = 1;
const DEFAULT_PRIORITY = 1000;
const CASH_SEGMENT = "cash";
const UNCLASSIFIED_SEGMENT = "unclassified";
const RISK_CATEGORIES: RiskCategory[] = ["brick", "paper", "hybrid", "cash", "other"];

export function simulateContributionAllocation(
	input: ContributionAllocationInput,
): AuditableContributionSimulation {
	assertFinitePositive(input.contributionAmount, "contributionAmount");
	assertAllowedAssetIds(input.allowedAssetIds);
	validateConstraints(input.constraints);

	const allowedAssetIds = new Set(input.allowedAssetIds);
	const baseSummary = calculatePortfolioSummary(input.positions, input.cashAccounts ?? []);
	const finalPortfolioValue = roundMoney(baseSummary.totalValue + input.contributionAmount);
	const currentValues = buildCurrentValues(input.positions, input.cashAccounts ?? []);
	const states = input.candidates.map((candidate) =>
		createCandidateState(candidate, input.constraints, allowedAssetIds),
	);
	const auditFindings = states.flatMap((state) => state.blockReasons);
	const allocationFindingKeys = new Set<string>();

	let remainingCash = roundMoney(input.contributionAmount);

	while (remainingCash > 0) {
		const next = chooseNextCandidate(
			states,
			currentValues,
			finalPortfolioValue,
			remainingCash,
			input.constraints,
			auditFindings,
			allocationFindingKeys,
		);
		if (!next) {
			break;
		}

		const lotSize = normalizedLotSize(next.candidate);
		const lotValue = roundMoney(lotSize * next.candidate.currentPrice);

		next.quantity += lotSize;
		next.investedAmount = roundMoney(next.investedAmount + lotValue);
		remainingCash = roundMoney(remainingCash - lotValue);
		addCandidateValue(currentValues, next.candidate, lotValue);
	}

	const orders = states
		.filter((state) => state.quantity > 0)
		.sort(compareCandidateState)
		.map(toOrder);

	const investedAmount = roundMoney(input.contributionAmount - remainingCash);
	if (remainingCash > 0) {
		auditFindings.push({
			code: "cash_unallocated",
			severity: "info",
			message: `${formatMoney(remainingCash)} stayed unallocated because no valid whole-lot simulation remained.`,
		});
	}

	const postAllocationValues = cloneCurrentValues(currentValues);
	if (remainingCash > 0) {
		addCashValue(postAllocationValues, remainingCash);
	}

	return {
		contributionAmount: roundMoney(input.contributionAmount),
		investedAmount,
		remainingCash,
		orders,
		auditFindings,
		postAllocation: {
			totalValue: finalPortfolioValue,
			byAsset: toPercentRecord(postAllocationValues.byAsset, finalPortfolioValue),
			byRiskCategory: toRiskPercentRecord(postAllocationValues.byRiskCategory, finalPortfolioValue),
			bySegment: toPercentRecord(postAllocationValues.bySegment, finalPortfolioValue),
		},
	};
}

function createCandidateState(
	candidate: ContributionCandidateInput,
	constraints: ContributionAllocationConstraints | undefined,
	allowedAssetIds: Set<string>,
): CandidateState {
	validateCandidate(candidate);

	const blockReasons = getCandidateBlockReasons(candidate, constraints, allowedAssetIds);

	return {
		candidate,
		blocked: blockReasons.length > 0,
		blockReasons,
		quantity: 0,
		investedAmount: 0,
	};
}

function getCandidateBlockReasons(
	candidate: ContributionCandidateInput,
	constraints: ContributionAllocationConstraints | undefined,
	allowedAssetIds: Set<string>,
): SimulationAuditFinding[] {
	const findings: SimulationAuditFinding[] = [];

	if (!allowedAssetIds.has(candidate.assetId)) {
		findings.push({
			code: "candidate_outside_universe",
			severity: "blocked",
			ticker: candidate.ticker,
			message: `${candidate.ticker} is outside the allowed investment universe for this simulation.`,
		});
	}

	for (const metric of requiredMetrics(candidate, constraints)) {
		if (!hasMetricSource(candidate, metric)) {
			findings.push({
				code: "missing_metric_source",
				severity: "blocked",
				ticker: candidate.ticker,
				metric,
				message: `${candidate.ticker} is missing source evidence for ${metric}.`,
			});
		}
	}

	if (candidate.maxPrice !== undefined && candidate.currentPrice > candidate.maxPrice) {
		findings.push({
			code: "price_above_limit",
			severity: "blocked",
			ticker: candidate.ticker,
			message: `${candidate.ticker} price ${formatMoney(candidate.currentPrice)} is above simulation limit ${formatMoney(candidate.maxPrice)}.`,
		});
	}

	if (
		constraints?.minDailyLiquidity !== undefined &&
		(candidate.dailyLiquidity ?? 0) < constraints.minDailyLiquidity
	) {
		findings.push({
			code: "liquidity_below_minimum",
			severity: "blocked",
			ticker: candidate.ticker,
			message: `${candidate.ticker} liquidity is below the simulation minimum.`,
		});
	}

	if (
		constraints?.maxConcentrationPercent !== undefined &&
		(candidate.concentrationPercent ?? 0) > constraints.maxConcentrationPercent
	) {
		findings.push({
			code: "concentration_above_limit",
			severity: "blocked",
			ticker: candidate.ticker,
			message: `${candidate.ticker} concentration is above the simulation limit.`,
		});
	}

	return findings;
}

function chooseNextCandidate(
	states: CandidateState[],
	currentValues: CurrentValues,
	finalPortfolioValue: number,
	remainingCash: number,
	constraints: ContributionAllocationConstraints | undefined,
	auditFindings: SimulationAuditFinding[],
	allocationFindingKeys: Set<string>,
): CandidateState | undefined {
	const options = states
		.filter((state) => !state.blocked)
		.map((state) =>
			scoreCandidate(
				state,
				currentValues,
				finalPortfolioValue,
				remainingCash,
				constraints,
				auditFindings,
				allocationFindingKeys,
			),
		)
		.filter((option): option is CandidateScore => option !== undefined)
		.sort(compareCandidateScore);

	return options[0]?.state;
}

function scoreCandidate(
	state: CandidateState,
	currentValues: CurrentValues,
	finalPortfolioValue: number,
	remainingCash: number,
	constraints: ContributionAllocationConstraints | undefined,
	auditFindings: SimulationAuditFinding[],
	allocationFindingKeys: Set<string>,
): CandidateScore | undefined {
	const candidate = state.candidate;
	const lotSize = normalizedLotSize(candidate);
	const lotValue = roundMoney(lotSize * candidate.currentPrice);

	if (lotValue <= 0 || lotValue > remainingCash) {
		return undefined;
	}

	const allocationFinding = getAllocationLimitFinding(
		candidate,
		currentValues,
		lotValue,
		finalPortfolioValue,
		constraints,
	);
	if (allocationFinding) {
		recordAllocationFinding(allocationFinding, auditFindings, allocationFindingKeys);
		return undefined;
	}

	const currentAssetValue = currentValues.byAsset.get(candidate.assetId) ?? 0;
	const currentPercent = percentOf(currentAssetValue, finalPortfolioValue);
	const nextPercent = percentOf(roundMoney(currentAssetValue + lotValue), finalPortfolioValue);
	const target = candidate.targetWeightPercent;
	const targetGapImprovement =
		target === undefined ? 0 : Math.abs(target - currentPercent) - Math.abs(target - nextPercent);

	if (target !== undefined && targetGapImprovement < 0) {
		return undefined;
	}

	return {
		state,
		targetGapImprovement,
		priority: candidate.priority ?? DEFAULT_PRIORITY,
		lotValue,
	};
}

function getAllocationLimitFinding(
	candidate: ContributionCandidateInput,
	currentValues: CurrentValues,
	lotValue: number,
	finalPortfolioValue: number,
	constraints: ContributionAllocationConstraints | undefined,
): SimulationAuditFinding | undefined {
	if (!constraints) {
		return undefined;
	}

	const assetValue = roundMoney((currentValues.byAsset.get(candidate.assetId) ?? 0) + lotValue);
	if (
		constraints.maxSingleAssetPercent !== undefined &&
		percentOf(assetValue, finalPortfolioValue) > constraints.maxSingleAssetPercent
	) {
		return allocationLimitFinding(candidate, "single asset");
	}

	const riskValue = roundMoney(
		(currentValues.byRiskCategory.get(candidate.riskCategory) ?? 0) + lotValue,
	);
	const maxRiskPercent = constraints.maxRiskCategoryPercent?.[candidate.riskCategory];
	if (maxRiskPercent !== undefined && percentOf(riskValue, finalPortfolioValue) > maxRiskPercent) {
		return allocationLimitFinding(candidate, "risk category");
	}

	const segment = normalizedSegment(candidate.segment);
	const segmentValue = roundMoney((currentValues.bySegment.get(segment) ?? 0) + lotValue);
	if (
		constraints.maxSegmentPercent !== undefined &&
		percentOf(segmentValue, finalPortfolioValue) > constraints.maxSegmentPercent
	) {
		return allocationLimitFinding(candidate, "segment");
	}

	return undefined;
}

function allocationLimitFinding(
	candidate: ContributionCandidateInput,
	limitLabel: string,
): SimulationAuditFinding {
	return {
		code: "allocation_limit_reached",
		severity: "blocked",
		ticker: candidate.ticker,
		message: `${candidate.ticker} cannot receive another simulated lot without violating the ${limitLabel} limit.`,
	};
}

function recordAllocationFinding(
	finding: SimulationAuditFinding,
	auditFindings: SimulationAuditFinding[],
	allocationFindingKeys: Set<string>,
): void {
	const key = `${finding.code}:${finding.ticker}:${finding.message}`;
	if (allocationFindingKeys.has(key)) {
		return;
	}

	allocationFindingKeys.add(key);
	auditFindings.push(finding);
}

function requiredMetrics(
	candidate: ContributionCandidateInput,
	constraints: ContributionAllocationConstraints | undefined,
): ContributionCandidateMetric[] {
	const metrics: ContributionCandidateMetric[] = ["price"];

	if (candidate.lotSize !== undefined) {
		metrics.push("lotSize");
	}
	if (candidate.targetWeightPercent !== undefined) {
		metrics.push("targetWeightPercent");
	}
	if (constraints?.maxRiskCategoryPercent !== undefined) {
		metrics.push("riskCategory");
	}
	if (constraints?.maxSegmentPercent !== undefined && candidate.segment !== undefined) {
		metrics.push("segment");
	}
	if (constraints?.minDailyLiquidity !== undefined) {
		metrics.push("dailyLiquidity");
	}
	if (constraints?.maxConcentrationPercent !== undefined) {
		metrics.push("concentrationPercent");
	}

	return metrics;
}

function hasMetricSource(
	candidate: ContributionCandidateInput,
	metric: ContributionCandidateMetric,
): boolean {
	return candidate.metricSourceRefs.some(
		(sourceRef) => sourceRef.metric === metric && sourceRef.label.trim().length > 0,
	);
}

function buildCurrentValues(
	positions: PortfolioPositionInput[],
	cashAccounts: PortfolioCashAccountInput[],
): CurrentValues {
	const values: CurrentValues = {
		byAsset: new Map(),
		byRiskCategory: new Map(),
		bySegment: new Map(),
	};

	for (const position of positions) {
		const value = calculatePositionValue(position);
		values.byAsset.set(
			position.assetId,
			roundMoney((values.byAsset.get(position.assetId) ?? 0) + value),
		);
		values.byRiskCategory.set(
			position.riskCategory,
			roundMoney((values.byRiskCategory.get(position.riskCategory) ?? 0) + value),
		);
		const segment = normalizedSegment(position.segment);
		values.bySegment.set(segment, roundMoney((values.bySegment.get(segment) ?? 0) + value));
	}

	const cashValue = roundMoney(
		cashAccounts.reduce((total, account) => {
			assertFiniteNonNegative(account.balance, "cashAccount.balance");
			return total + account.balance;
		}, 0),
	);
	if (cashValue > 0) {
		addCashValue(values, cashValue);
	}

	return values;
}

function addCandidateValue(
	values: CurrentValues,
	candidate: ContributionCandidateInput,
	lotValue: number,
): void {
	values.byAsset.set(
		candidate.assetId,
		roundMoney((values.byAsset.get(candidate.assetId) ?? 0) + lotValue),
	);
	values.byRiskCategory.set(
		candidate.riskCategory,
		roundMoney((values.byRiskCategory.get(candidate.riskCategory) ?? 0) + lotValue),
	);
	const segment = normalizedSegment(candidate.segment);
	values.bySegment.set(segment, roundMoney((values.bySegment.get(segment) ?? 0) + lotValue));
}

function addCashValue(values: CurrentValues, cashValue: number): void {
	values.byRiskCategory.set(
		"cash",
		roundMoney((values.byRiskCategory.get("cash") ?? 0) + cashValue),
	);
	values.bySegment.set(
		CASH_SEGMENT,
		roundMoney((values.bySegment.get(CASH_SEGMENT) ?? 0) + cashValue),
	);
}

function cloneCurrentValues(values: CurrentValues): CurrentValues {
	return {
		byAsset: new Map(values.byAsset),
		byRiskCategory: new Map(values.byRiskCategory),
		bySegment: new Map(values.bySegment),
	};
}

function toOrder(state: CandidateState): SimulatedContributionOrder {
	const estimatedMonthlyDividend =
		state.candidate.estimatedMonthlyDividendPerUnit === undefined
			? undefined
			: roundMoney(state.quantity * state.candidate.estimatedMonthlyDividendPerUnit);

	return {
		assetId: state.candidate.assetId,
		ticker: state.candidate.ticker,
		quantity: state.quantity,
		limitPrice: state.candidate.maxPrice ?? state.candidate.currentPrice,
		estimatedValue: state.investedAmount,
		estimatedMonthlyDividend,
		metricSourceRefs: state.candidate.metricSourceRefs,
	};
}

function toPercentRecord(values: Map<string, number>, totalValue: number): Record<string, number> {
	return Object.fromEntries(
		[...values.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([label, value]) => [label, percentOf(value, totalValue)]),
	);
}

function toRiskPercentRecord(
	values: Map<RiskCategory, number>,
	totalValue: number,
): Record<RiskCategory, number> {
	return Object.fromEntries(
		RISK_CATEGORIES.map((category) => [category, percentOf(values.get(category) ?? 0, totalValue)]),
	) as Record<RiskCategory, number>;
}

function normalizedLotSize(candidate: ContributionCandidateInput): number {
	const lotSize = candidate.lotSize ?? DEFAULT_LOT_SIZE;
	if (!Number.isInteger(lotSize) || lotSize <= 0) {
		throw new Error(`${candidate.ticker}.lotSize must be a positive integer`);
	}

	return lotSize;
}

function normalizedSegment(segment: string | undefined): string {
	const normalized = segment?.trim();
	return normalized ? normalized : UNCLASSIFIED_SEGMENT;
}

function percentOf(value: number, totalValue: number): number {
	if (totalValue <= 0) {
		return 0;
	}

	return roundPercent((value / totalValue) * PERCENT_SCALE);
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function roundPercent(value: number): number {
	return Math.round((value + Number.EPSILON) * PERCENT_SCALE) / PERCENT_SCALE;
}

function validateCandidate(candidate: ContributionCandidateInput): void {
	assertFinitePositive(candidate.currentPrice, `${candidate.ticker}.currentPrice`);
	assertOptionalFinitePositive(candidate.maxPrice, `${candidate.ticker}.maxPrice`);
	assertOptionalPercent(candidate.targetWeightPercent, `${candidate.ticker}.targetWeightPercent`);
	assertOptionalFiniteNonNegative(candidate.dailyLiquidity, `${candidate.ticker}.dailyLiquidity`);
	assertOptionalPercent(candidate.concentrationPercent, `${candidate.ticker}.concentrationPercent`);
	assertOptionalFiniteNonNegative(
		candidate.estimatedMonthlyDividendPerUnit,
		`${candidate.ticker}.estimatedMonthlyDividendPerUnit`,
	);
	normalizedLotSize(candidate);
}

function validateConstraints(constraints: ContributionAllocationConstraints | undefined): void {
	if (!constraints) {
		return;
	}

	assertOptionalPercent(constraints.maxSingleAssetPercent, "constraints.maxSingleAssetPercent");
	assertOptionalPercent(constraints.maxSegmentPercent, "constraints.maxSegmentPercent");
	assertOptionalFiniteNonNegative(constraints.minDailyLiquidity, "constraints.minDailyLiquidity");
	assertOptionalPercent(constraints.maxConcentrationPercent, "constraints.maxConcentrationPercent");

	if (constraints.maxRiskCategoryPercent) {
		for (const [category, value] of Object.entries(constraints.maxRiskCategoryPercent)) {
			assertOptionalPercent(value, `constraints.maxRiskCategoryPercent.${category}`);
		}
	}
}

function assertAllowedAssetIds(allowedAssetIds: string[]): void {
	if (!Array.isArray(allowedAssetIds) || allowedAssetIds.length === 0) {
		throw new Error("allowedAssetIds must contain at least one asset id");
	}
}

function assertOptionalFiniteNonNegative(value: number | undefined, field: string): void {
	if (value === undefined) {
		return;
	}

	assertFiniteNonNegative(value, field);
}

function assertFiniteNonNegative(value: number, field: string): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${field} must be a finite non-negative number`);
	}
}

function assertOptionalFinitePositive(value: number | undefined, field: string): void {
	if (value === undefined) {
		return;
	}

	assertFinitePositive(value, field);
}

function assertFinitePositive(value: number, field: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${field} must be a finite positive number`);
	}
}

function assertOptionalPercent(value: number | undefined, field: string): void {
	if (value === undefined) {
		return;
	}

	if (!Number.isFinite(value) || value < 0 || value > 100) {
		throw new Error(`${field} must be a finite percentage from 0 to 100`);
	}
}

function compareCandidateScore(left: CandidateScore, right: CandidateScore): number {
	const targetDifference = right.targetGapImprovement - left.targetGapImprovement;
	if (targetDifference !== 0) {
		return targetDifference;
	}

	const priorityDifference = left.priority - right.priority;
	if (priorityDifference !== 0) {
		return priorityDifference;
	}

	const lotValueDifference = right.lotValue - left.lotValue;
	if (lotValueDifference !== 0) {
		return lotValueDifference;
	}

	const tickerDifference = left.state.candidate.ticker.localeCompare(right.state.candidate.ticker);
	if (tickerDifference !== 0) {
		return tickerDifference;
	}

	return left.state.candidate.assetId.localeCompare(right.state.candidate.assetId);
}

function compareCandidateState(left: CandidateState, right: CandidateState): number {
	const priorityDifference =
		(left.candidate.priority ?? DEFAULT_PRIORITY) - (right.candidate.priority ?? DEFAULT_PRIORITY);
	if (priorityDifference !== 0) {
		return priorityDifference;
	}

	const tickerDifference = left.candidate.ticker.localeCompare(right.candidate.ticker);
	if (tickerDifference !== 0) {
		return tickerDifference;
	}

	return left.candidate.assetId.localeCompare(right.candidate.assetId);
}

function formatMoney(value: number): string {
	return `BRL ${roundMoney(value).toFixed(2)}`;
}
