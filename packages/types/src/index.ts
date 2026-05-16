export type CurrencyCode = "BRL" | "USD";

export type AssetType = "fii" | "stock" | "etf" | "cash" | "other";

export type RiskCategory = "brick" | "paper" | "hybrid" | "cash" | "other";

export const reviewSeverities = {
	info: "info",
	warning: "warning",
	alert: "alert",
	priority: "priority",
} as const;

export type ReviewSeverity = (typeof reviewSeverities)[keyof typeof reviewSeverities];

export const strategyAlertCodes = {
	reviewCadence: "review_cadence",
	maxSingleAssetPercent: "max_single_asset_percent",
	maxPaperHybridPercent: "max_paper_hybrid_percent",
	minBrickPercent: "min_brick_percent",
	maxSectorPercent: "max_sector_percent",
	minCashPercent: "min_cash_percent",
	manualReviewRequired: "manual_review_required",
	riskChecklistRequired: "risk_checklist_required",
} as const;

export type StrategyAlertCode = (typeof strategyAlertCodes)[keyof typeof strategyAlertCodes];

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
	code: StrategyAlertCode;
	severity: ReviewSeverity;
	message: string;
}
