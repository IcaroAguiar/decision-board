export type CurrencyCode = "BRL" | "USD";

export type AssetType = "fii" | "stock" | "etf" | "cash" | "other";

export type RiskCategory = "brick" | "paper" | "hybrid" | "cash" | "other";

export type ReviewSeverity = "info" | "warning" | "alert" | "priority";

export interface PortfolioPositionInput {
	assetId: string;
	ticker: string;
	quantity: number;
	currentPrice: number;
	riskCategory: RiskCategory;
	segment?: string;
}

export interface PortfolioCashAccountInput {
	id: string;
	name: string;
	balance: number;
	type: string;
	liquidity?: string;
}

export interface StrategyAlert {
	code: string;
	severity: ReviewSeverity;
	message: string;
}
