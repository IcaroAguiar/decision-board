import { Injectable } from "@nestjs/common";
import type {
	AssetType,
	ContributionCycleStatus,
	ContributionFrequency,
	Prisma,
	RiskCategory,
} from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";

const REPORT_POSITION_LIMIT = 200;
const REPORT_CASH_ACCOUNT_LIMIT = 200;
const REPORT_CONTRIBUTION_PLAN_LIMIT = 50;
const REPORT_CONTRIBUTION_CYCLE_LIMIT = 5;
const SAVED_REPORT_LIST_LIMIT = 100;

export const createSavedReportResultStatuses = {
	created: "created",
	cycleChanged: "cycle-changed",
	cycleNotConfirmed: "cycle-not-confirmed",
	cycleNotFound: "cycle-not-found",
} as const;

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
	id: string;
	cycleMonth: Date;
	plannedAmount: DecimalValue;
	confirmedAmount: DecimalValue | null;
	status: ContributionCycleStatus;
	strategyId: string;
	reportRecommendedAt: Date | null;
	reportRecommendationReason: string | null;
	updatedAt: Date;
}

interface CreateSavedReportBaseData {
	schemaVersion: string;
	generatedAt: Date;
	strategyId: string | null;
	alertCount: number;
	jsonReport: Prisma.InputJsonValue;
	markdownReport: string;
}

export type CreateSavedReportData =
	| (CreateSavedReportBaseData & {
			contributionCycleId: string;
			contributionCycleUpdatedAt: Date;
	  })
	| (CreateSavedReportBaseData & {
			contributionCycleId?: undefined;
			contributionCycleUpdatedAt?: undefined;
	  });

export type CreateSavedReportResult =
	| {
			status: typeof createSavedReportResultStatuses.created;
			report: SavedReportMetadataData;
	  }
	| { status: typeof createSavedReportResultStatuses.cycleChanged }
	| { status: typeof createSavedReportResultStatuses.cycleNotConfirmed }
	| { status: typeof createSavedReportResultStatuses.cycleNotFound };

export interface SavedReportMetadataData {
	id: string;
	schemaVersion: string;
	generatedAt: Date;
	strategyId: string | null;
	alertCount: number;
	createdAt: Date;
}

export interface SavedReportContentData extends SavedReportMetadataData {
	jsonReport: Prisma.JsonValue;
	markdownReport: string;
}

@Injectable()
export class ReportsRepository {
	findPortfolioReportData(
		userId: string,
		portfolioId: string,
		selectedContributionCycleId?: string,
	): Promise<ReportPortfolioData | null> {
		return prisma.portfolio
			.findUnique({
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
						select: reportContributionCycleSelect,
					},
				},
			})
			.then(async (portfolio) => {
				if (!portfolio || !selectedContributionCycleId) {
					return portfolio;
				}

				const selectedCycle =
					portfolio.contributionCycles.find((cycle) => cycle.id === selectedContributionCycleId) ??
					(await prisma.contributionCycle.findFirst({
						where: {
							id: selectedContributionCycleId,
							userId,
							portfolioId,
						},
						select: reportContributionCycleSelect,
					}));

				if (!selectedCycle) {
					return portfolio;
				}

				return {
					...portfolio,
					contributionCycles: [
						selectedCycle,
						...portfolio.contributionCycles
							.filter((cycle) => cycle.id !== selectedContributionCycleId)
							.slice(0, REPORT_CONTRIBUTION_CYCLE_LIMIT - 1),
					],
				};
			});
	}

	async createSavedReport(
		userId: string,
		portfolioId: string,
		data: CreateSavedReportData,
	): Promise<CreateSavedReportResult> {
		return prisma.$transaction(async (tx) => {
			if (data.contributionCycleId) {
				const update = await tx.contributionCycle.updateMany({
					where: {
						id: data.contributionCycleId,
						userId,
						portfolioId,
						status: "CONFIRMED",
						updatedAt: data.contributionCycleUpdatedAt,
					},
					data: {
						status: "REPORTED" satisfies ContributionCycleStatus,
					},
				});

				if (update.count === 0) {
					const cycle = await tx.contributionCycle.findFirst({
						where: {
							id: data.contributionCycleId,
							userId,
							portfolioId,
						},
						select: {
							id: true,
							status: true,
							updatedAt: true,
						},
					});

					if (!cycle) {
						return { status: createSavedReportResultStatuses.cycleNotFound };
					}

					return cycle.status === "CONFIRMED"
						? { status: createSavedReportResultStatuses.cycleChanged }
						: { status: createSavedReportResultStatuses.cycleNotConfirmed };
				}
			}

			const report = await tx.report.create({
				data: {
					userId,
					portfolioId,
					schemaVersion: data.schemaVersion,
					generatedAt: data.generatedAt,
					strategyId: data.strategyId,
					alertCount: data.alertCount,
					jsonReport: data.jsonReport,
					markdownReport: data.markdownReport,
				},
				select: savedReportMetadataSelect,
			});

			return {
				report,
				status: createSavedReportResultStatuses.created,
			};
		});
	}

	async findSavedReportsByPortfolio(
		userId: string,
		portfolioId: string,
	): Promise<SavedReportMetadataData[] | null> {
		const portfolio = await prisma.portfolio.findUnique({
			where: {
				id_userId: {
					id: portfolioId,
					userId,
				},
			},
			select: {
				id: true,
			},
		});

		if (!portfolio) {
			return null;
		}

		return prisma.report.findMany({
			where: {
				userId,
				portfolioId,
			},
			take: SAVED_REPORT_LIST_LIMIT,
			orderBy: [
				{
					createdAt: "desc",
				},
				{
					id: "asc",
				},
			],
			select: savedReportMetadataSelect,
		});
	}

	findSavedReportByUser(
		userId: string,
		portfolioId: string,
		reportId: string,
	): Promise<SavedReportContentData | null> {
		return prisma.report.findFirst({
			where: {
				id: reportId,
				userId,
				portfolioId,
			},
			select: {
				...savedReportMetadataSelect,
				jsonReport: true,
				markdownReport: true,
			},
		});
	}
}

const savedReportMetadataSelect = {
	id: true,
	schemaVersion: true,
	generatedAt: true,
	strategyId: true,
	alertCount: true,
	createdAt: true,
} as const;

const reportContributionCycleSelect = {
	id: true,
	cycleMonth: true,
	plannedAmount: true,
	confirmedAmount: true,
	status: true,
	strategyId: true,
	reportRecommendedAt: true,
	reportRecommendationReason: true,
	updatedAt: true,
} as const;
