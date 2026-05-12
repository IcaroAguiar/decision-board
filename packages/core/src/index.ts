import type { PortfolioPositionInput, RiskCategory } from "@decision-board/types";

export interface PortfolioSummary {
	totalValue: number;
	assetCount: number;
	allocationByRiskCategory: Record<RiskCategory, number>;
}

const riskCategories: RiskCategory[] = ["brick", "paper", "hybrid", "cash", "other"];

export function calculatePositionValue(position: PortfolioPositionInput): number {
	return position.quantity * position.currentPrice;
}

export function calculatePortfolioSummary(positions: PortfolioPositionInput[]): PortfolioSummary {
	const totalValue = positions.reduce(
		(total, position) => total + calculatePositionValue(position),
		0,
	);
	const allocationByRiskCategory = Object.fromEntries(
		riskCategories.map((category) => [category, 0]),
	) as Record<RiskCategory, number>;

	for (const position of positions) {
		allocationByRiskCategory[position.riskCategory] += calculatePositionValue(position);
	}

	return {
		totalValue,
		assetCount: positions.length,
		allocationByRiskCategory,
	};
}
