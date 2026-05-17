import { Injectable } from "@nestjs/common";
import type {
	AssetType,
	ContributionCycleStatus,
	ContributionFrequency,
	RiskCategory,
} from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";

const REPORT_POSITION_LIMIT = 200;
const REPORT_CASH_ACCOUNT_LIMIT = 200;
const REPORT_CONTRIBUTION_PLAN_LIMIT = 50;
const REPORT_CONTRIBUTION_CYCLE_LIMIT = 5;

export interface DecimalValue {
	toString(): string;
}

export interface ReportPortfolioData {
	name: string;
	baseCurrency: string;
	createdAt: Date;
	updatedAt: Date;
	positions: ReportPositionData[];
	cashAccounts: ReportCashAccountData[];
	contributionPlans: ReportContributionPlanData[];
	contributionCycles: ReportContributionCycleData[];
}

export interface ReportPositionData {
	quantity: DecimalValue;
	averagePrice: DecimalValue | null;
	manualCurrentPrice: DecimalValue | null;
	asset: {
		id: string;
		ticker: string;
		name: string;
		assetType: AssetType;
		riskCategory: RiskCategory;
		segment: string | null;
		currency: string;
		exchange: string | null;
		userAssetOverrides: Array<{
			customName: string | null;
			customAssetType: AssetType | null;
			customRiskCategory: RiskCategory | null;
			customSegment: string | null;
		}>;
	};
}

export interface ReportCashAccountData {
	name: string;
	type: string;
	balance: DecimalValue;
	liquidity: string | null;
	benchmark: string | null;
	benchmarkPercent: DecimalValue | null;
}

export interface ReportContributionPlanData {
	amount: DecimalValue;
	frequency: ContributionFrequency;
	dayOfMonth: number;
	startsAt: Date;
	endsAt: Date | null;
	defaultStrategyId: string;
	cashAccount: {
		name: string;
	} | null;
}

export interface ReportContributionCycleData {
	cycleMonth: Date;
	plannedAmount: DecimalValue;
	confirmedAmount: DecimalValue | null;
	status: ContributionCycleStatus;
	strategyId: string;
	reportRecommendedAt: Date | null;
	reportRecommendationReason: string | null;
}

@Injectable()
export class ReportsRepository {
	findPortfolioReportData(
		userId: string,
		portfolioId: string,
	): Promise<ReportPortfolioData | null> {
		return prisma.portfolio.findUnique({
			where: {
				id_userId: {
					id: portfolioId,
					userId,
				},
			},
			select: {
				name: true,
				baseCurrency: true,
				createdAt: true,
				updatedAt: true,
				positions: {
					take: REPORT_POSITION_LIMIT,
					orderBy: [
						{
							createdAt: "asc",
						},
						{
							id: "asc",
						},
					],
					select: {
						quantity: true,
						averagePrice: true,
						manualCurrentPrice: true,
						asset: {
							select: {
								id: true,
								ticker: true,
								name: true,
								assetType: true,
								riskCategory: true,
								segment: true,
								currency: true,
								exchange: true,
								userAssetOverrides: {
									where: {
										userId,
									},
									take: 1,
									select: {
										customName: true,
										customAssetType: true,
										customRiskCategory: true,
										customSegment: true,
									},
								},
							},
						},
					},
				},
				cashAccounts: {
					take: REPORT_CASH_ACCOUNT_LIMIT,
					orderBy: [
						{
							createdAt: "asc",
						},
						{
							id: "asc",
						},
					],
					select: {
						name: true,
						type: true,
						balance: true,
						liquidity: true,
						benchmark: true,
						benchmarkPercent: true,
					},
				},
				contributionPlans: {
					where: {
						isActive: true,
					},
					take: REPORT_CONTRIBUTION_PLAN_LIMIT,
					orderBy: [
						{
							startsAt: "asc",
						},
						{
							dayOfMonth: "asc",
						},
						{
							id: "asc",
						},
					],
					select: {
						amount: true,
						frequency: true,
						dayOfMonth: true,
						startsAt: true,
						endsAt: true,
						defaultStrategyId: true,
						cashAccount: {
							select: {
								name: true,
							},
						},
					},
				},
				contributionCycles: {
					take: REPORT_CONTRIBUTION_CYCLE_LIMIT,
					orderBy: [
						{
							cycleMonth: "desc",
						},
						{
							createdAt: "desc",
						},
						{
							id: "asc",
						},
					],
					select: {
						cycleMonth: true,
						plannedAmount: true,
						confirmedAmount: true,
						status: true,
						strategyId: true,
						reportRecommendedAt: true,
						reportRecommendationReason: true,
					},
				},
			},
		});
	}
}
