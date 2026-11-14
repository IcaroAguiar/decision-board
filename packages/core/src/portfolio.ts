import type {
	PortfolioCashAccountInput,
	PortfolioPositionInput,
	RiskCategory,
} from "@decision-board/types";

export interface AllocationBucket {
	value: number;
	percent: number;
}

export interface AssetAllocation extends AllocationBucket {
	assetId: string;
	ticker: string;
}

export interface PortfolioAllocation {
	byAsset: AssetAllocation[];
	byRiskCategory: Record<RiskCategory, AllocationBucket>;
	bySegment: Record<string, AllocationBucket>;
}

export interface EstimatedDividends {
	monthly: number;
	annual: number;
	monthlyYieldPercent: number;
	annualYieldPercent: number;
}

export interface PortfolioSummary {
	totalValue: number;
	positionsValue: number;
	cashValue: number;
	assetCount: number;
	cashAccountCount: number;
	allocationByRiskCategory: Record<RiskCategory, number>;
	allocation: PortfolioAllocation;
	estimatedDividends: EstimatedDividends;
}

const riskCategories: RiskCategory[] = ["brick", "paper", "hybrid", "cash", "other"];
const cashSegment = "cash";
const unclassifiedSegment = "unclassified";
const moneyScale = 100;
const percentScale = 100;
const percentRoundingScale = 100;

export function calculatePositionValue(position: PortfolioPositionInput): number {
	assertFiniteNonNegative(position.quantity, "position.quantity");
	assertFiniteNonNegative(position.currentPrice, "position.currentPrice");

	return roundMoney(position.quantity * position.currentPrice);
}

export function calculateAllocation(
	positions: PortfolioPositionInput[],
	cashAccounts: PortfolioCashAccountInput[] = [],
): PortfolioAllocation {
	const positionsValue = positions.reduce(
		(total, position) => total + calculatePositionValue(position),
		0,
	);
	const cashValue = calculateCashValue(cashAccounts);
	const totalValue = roundMoney(positionsValue + cashValue);
	const byRiskCategory = createEmptyRiskAllocation();
	const segmentValues = new Map<string, number>();
	const assetValues = new Map<string, { assetId: string; ticker: string; value: number }>();

	for (const position of positions) {
		const value = calculatePositionValue(position);
		byRiskCategory[position.riskCategory].value = roundMoney(
			byRiskCategory[position.riskCategory].value + value,
		);
		const segment = normalizedSegment(position.segment);
		segmentValues.set(segment, roundMoney((segmentValues.get(segment) ?? 0) + value));

		const existingAsset = assetValues.get(position.assetId);
		if (existingAsset) {
			if (existingAsset.ticker !== position.ticker) {
				throw new Error("position.ticker must be stable for the same assetId");
			}

			existingAsset.value = roundMoney(existingAsset.value + value);
		} else {
			assetValues.set(position.assetId, {
				assetId: position.assetId,
				ticker: position.ticker,
				value,
			});
		}
	}

	const byAsset = [...assetValues.values()]
		.map((asset) => ({
			...asset,
			percent: percentOf(asset.value, totalValue),
		}))
		.sort(compareAssetAllocation);

	if (cashValue > 0) {
		byRiskCategory.cash.value = roundMoney(byRiskCategory.cash.value + cashValue);
		segmentValues.set(cashSegment, roundMoney((segmentValues.get(cashSegment) ?? 0) + cashValue));
	}

	for (const category of riskCategories) {
		byRiskCategory[category].percent = percentOf(byRiskCategory[category].value, totalValue);
	}

	const bySegment = Object.fromEntries(
		[...segmentValues.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([segment, value]) => [
				segment,
				{
					value,
					percent: percentOf(value, totalValue),
				},
			]),
	);

	return {
		byAsset,
		byRiskCategory,
		bySegment,
	};
}

export function calculateEstimatedDividends(
	positions: PortfolioPositionInput[],
	totalValue = positions.reduce((total, position) => total + calculatePositionValue(position), 0),
): EstimatedDividends {
	assertFiniteNonNegative(totalValue, "totalValue");

	const monthly = roundMoney(
		positions.reduce((total, position) => {
			const estimatedMonthlyDividend = position.estimatedMonthlyDividend ?? 0;
			assertFiniteNonNegative(estimatedMonthlyDividend, "position.estimatedMonthlyDividend");

			return total + estimatedMonthlyDividend;
		}, 0),
	);
	const annual = roundMoney(monthly * 12);

	return {
		monthly,
		annual,
		monthlyYieldPercent: percentOf(monthly, roundMoney(totalValue)),
		annualYieldPercent: percentOf(annual, roundMoney(totalValue)),
	};
}

export function calculatePortfolioSummary(
	positions: PortfolioPositionInput[],
	cashAccounts: PortfolioCashAccountInput[] = [],
): PortfolioSummary {
	const positionsValue = positions.reduce(
		(total, position) => total + calculatePositionValue(position),
		0,
	);
	const cashValue = calculateCashValue(cashAccounts);
	const totalValue = roundMoney(positionsValue + cashValue);
	const allocation = calculateAllocation(positions, cashAccounts);
	const allocationByRiskCategory = Object.fromEntries(
		riskCategories.map((category) => [category, allocation.byRiskCategory[category].value]),
	) as Record<RiskCategory, number>;
	const estimatedDividends = calculateEstimatedDividends(positions, totalValue);

	return {
		totalValue,
		positionsValue: roundMoney(positionsValue),
		cashValue,
		assetCount: positions.length,
		cashAccountCount: cashAccounts.length,
		allocationByRiskCategory,
		allocation,
		estimatedDividends,
	};
}

function createEmptyRiskAllocation(): Record<RiskCategory, AllocationBucket> {
	return Object.fromEntries(
		riskCategories.map((category) => [
			category,
			{
				value: 0,
				percent: 0,
			},
		]),
	) as Record<RiskCategory, AllocationBucket>;
}

function calculateCashValue(cashAccounts: PortfolioCashAccountInput[]): number {
	return roundMoney(
		cashAccounts.reduce((total, account) => {
			assertFiniteNonNegative(account.balance, "cashAccount.balance");

			return total + account.balance;
		}, 0),
	);
}

function normalizedSegment(segment: string | undefined): string {
	const normalized = segment?.trim();
	return normalized ? normalized : unclassifiedSegment;
}

function percentOf(value: number, totalValue: number): number {
	if (totalValue <= 0) {
		return 0;
	}

	return roundPercent((value / totalValue) * percentScale);
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * moneyScale) / moneyScale;
}

function roundPercent(value: number): number {
	return Math.round((value + Number.EPSILON) * percentRoundingScale) / percentRoundingScale;
}

function assertFiniteNonNegative(value: number, field: string): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${field} must be a finite non-negative number`);
	}
}

function compareAssetAllocation(left: AssetAllocation, right: AssetAllocation): number {
	const percentDifference = right.percent - left.percent;
	if (percentDifference !== 0) {
		return percentDifference;
	}

	return left.ticker.localeCompare(right.ticker);
}
