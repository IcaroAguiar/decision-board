import type {
	PortfolioCashAccountInput,
	PortfolioPositionInput,
	RiskCategory,
} from "@decision-board/types";

export interface PortfolioSummary {
	totalValue: number;
	positionsValue: number;
	cashValue: number;
	assetCount: number;
	cashAccountCount: number;
	allocationByRiskCategory: Record<RiskCategory, number>;
}

const riskCategories: RiskCategory[] = ["brick", "paper", "hybrid", "cash", "other"];

export function calculatePositionValue(position: PortfolioPositionInput): number {
	return position.quantity * position.currentPrice;
}

export function calculatePortfolioSummary(
	positions: PortfolioPositionInput[],
	cashAccounts: PortfolioCashAccountInput[] = [],
): PortfolioSummary {
	const positionsValue = positions.reduce(
		(total, position) => total + calculatePositionValue(position),
		0,
	);
	const cashValue = cashAccounts.reduce((total, account) => total + account.balance, 0);
	const totalValue = positionsValue + cashValue;
	const allocationByRiskCategory = Object.fromEntries(
		riskCategories.map((category) => [category, 0]),
	) as Record<RiskCategory, number>;

	for (const position of positions) {
		allocationByRiskCategory[position.riskCategory] += calculatePositionValue(position);
	}

	allocationByRiskCategory.cash += cashValue;

	return {
		totalValue,
		positionsValue,
		cashValue,
		assetCount: positions.length,
		cashAccountCount: cashAccounts.length,
		allocationByRiskCategory,
	};
}
