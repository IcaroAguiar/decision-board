import { calculatePortfolioSummary } from "@decision-board/core";
import {
	generateJsonReport,
	generateMarkdownReport,
	type ReportEnvelope,
	validateJsonReport,
} from "@decision-board/reports";
import { evaluateStrategy, getStrategyById } from "@decision-board/strategies";
import type {
	AssetType,
	PortfolioCashAccountInput,
	PortfolioPositionInput,
	RiskCategory,
	StrategyId,
} from "@decision-board/types";
import { strategyIds } from "@decision-board/types";
import {
	ConflictException,
	Inject,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CreateSavedReportDto } from "./report.dto.js";
import type {
	DecimalValue,
	ReportCashAccountData,
	ReportContributionCycleData,
	ReportContributionPlanData,
	ReportPortfolioData,
	ReportPositionData,
	SavedReportContentData,
	SavedReportMetadataData,
} from "./reports.repository.js";
import { createSavedReportResultStatuses, ReportsRepository } from "./reports.repository.js";

const REPORT_SCHEMA_VERSION = "1.0";
const MONEY_SCALE = 100;
const DATE_ONLY_LENGTH = 10;
const CYCLE_MONTH_LENGTH = 7;

export interface ReportExportResponse {
	json: ReportEnvelope;
	markdown: string;
}

export interface SavedReportMetadataResponse {
	id: string;
	schemaVersion: string;
	generatedAt: string;
	strategyId: string | null;
	alertCount: number;
	createdAt: string;
}

export interface SavedReportContentResponse extends SavedReportMetadataResponse {
	json: ReportEnvelope;
	markdown: string;
}

interface ReportPositionEntry {
	ticker: string;
	name: string;
	assetType: AssetType;
	riskCategory: RiskCategory;
	segment: string | null;
	quantity: number;
	averagePrice: number | null;
	currentPrice: number | null;
	totalValue: number | null;
	currency: string;
	exchange: string | null;
}

interface ReportPositionProjection {
	report: ReportPositionEntry;
	calculationInput: PortfolioPositionInput | null;
}

@Injectable()
export class ReportsService {
	constructor(@Inject(ReportsRepository) private readonly reports: ReportsRepository) {}

	async exportPortfolioReport(userId: string, portfolioId: string): Promise<ReportExportResponse> {
		const data = await this.reports.findPortfolioReportData(userId, portfolioId);

		if (!data) {
			throw new NotFoundException("Portfolio not found");
		}

		const envelope = createReportEnvelope(data);

		return {
			json: generateJsonReport(envelope),
			markdown: generateMarkdownReport(envelope),
		};
	}

	async createSavedReport(
		userId: string,
		portfolioId: string,
		data: CreateSavedReportDto = {},
	): Promise<SavedReportMetadataResponse> {
		const report = await this.exportPortfolioReport(userId, portfolioId);
		const result = await this.reports.createSavedReport(userId, portfolioId, {
			contributionCycleId: data.contributionCycleId,
			schemaVersion: report.json.schemaVersion,
			generatedAt: new Date(report.json.generatedAt),
			strategyId: readReportStrategyIdFromEnvelope(report.json),
			alertCount: report.json.alerts.length,
			jsonReport: toPrismaJson(report.json),
			markdownReport: report.markdown,
		});

		if (result.status === createSavedReportResultStatuses.cycleNotFound) {
			throw new NotFoundException("Contribution cycle not found");
		}

		if (result.status === createSavedReportResultStatuses.cycleNotConfirmed) {
			throw new ConflictException("Contribution cycle must be confirmed before report generation");
		}

		return toSavedReportMetadataResponse(result.report);
	}

	async listSavedReports(
		userId: string,
		portfolioId: string,
	): Promise<SavedReportMetadataResponse[]> {
		const reports = await this.reports.findSavedReportsByPortfolio(userId, portfolioId);

		if (!reports) {
			throw new NotFoundException("Portfolio not found");
		}

		return reports.map(toSavedReportMetadataResponse);
	}

	async getSavedReport(
		userId: string,
		portfolioId: string,
		reportId: string,
	): Promise<SavedReportContentResponse> {
		const report = await this.reports.findSavedReportByUser(userId, portfolioId, reportId);

		if (!report) {
			throw new NotFoundException("Report not found");
		}

		return toSavedReportContentResponse(report);
	}
}

function createReportEnvelope(data: ReportPortfolioData): ReportEnvelope {
	const positionProjections = data.positions.map(toReportPositionProjection);
	const positions = positionProjections.map((position) => position.report);
	const pricedPositions = positionProjections
		.map((position) => position.calculationInput)
		.filter(isPresent);
	const cashAccounts = data.cashAccounts.map(toCashAccountInput);
	const summary = calculatePortfolioSummary(pricedPositions, cashAccounts);
	const strategy = getReportStrategy(data);
	const strategyEvaluation = evaluateStrategy(
		{
			positions: pricedPositions,
			cashAccounts,
		},
		strategy,
	);

	return {
		schemaVersion: REPORT_SCHEMA_VERSION,
		generatedAt: new Date().toISOString(),
		strategy: {
			id: strategy.id,
			name: strategy.name,
			riskLevel: strategy.riskLevel,
			reportIntervalDays: strategy.reportIntervalDays,
			rules: strategy.rules,
		},
		contribution: {
			activePlans: data.contributionPlans.map(toContributionPlanReport),
			latestCycles: data.contributionCycles.map(toContributionCycleReport),
		},
		cash: {
			totalValue: summary.cashValue,
			accounts: data.cashAccounts.map(toCashAccountReport),
		},
		portfolio: {
			name: data.name,
			baseCurrency: data.baseCurrency,
			createdAt: data.createdAt.toISOString(),
			updatedAt: data.updatedAt.toISOString(),
			totalValue: summary.totalValue,
			positionsValue: summary.positionsValue,
			cashValue: summary.cashValue,
			positionCount: data.positions.length,
			pricedPositionCount: pricedPositions.length,
			unpricedPositionCount: data.positions.length - pricedPositions.length,
			cashAccountCount: data.cashAccounts.length,
		},
		positions,
		allocation: {
			byAsset: summary.allocation.byAsset.map(({ ticker, value, percent }) => ({
				ticker,
				value,
				percent,
			})),
			byRiskCategory: summary.allocation.byRiskCategory,
			bySegment: summary.allocation.bySegment,
			estimatedDividends: summary.estimatedDividends,
		},
		alerts: strategyEvaluation.alerts,
		reviewPolicy: {
			reportIntervalDays: strategy.reportIntervalDays,
			nextAction: "review required by configured cadence",
			pricedPositionCount: pricedPositions.length,
			unpricedPositionCount: data.positions.length - pricedPositions.length,
		},
		userNotes: [],
	};
}

function toReportPositionProjection(position: ReportPositionData): ReportPositionProjection {
	const override = position.asset.userAssetOverrides[0] ?? null;
	const quantity = decimalToNumber(position.quantity);
	const currentPrice = decimalToNullableNumber(position.manualCurrentPrice);
	const riskCategory = toRiskCategory(override?.customRiskCategory ?? position.asset.riskCategory);
	const segment = override?.customSegment ?? position.asset.segment;
	const report = {
		ticker: position.asset.ticker,
		name: override?.customName ?? position.asset.name,
		assetType: toAssetType(override?.customAssetType ?? position.asset.assetType),
		riskCategory,
		segment,
		quantity,
		averagePrice: decimalToNullableNumber(position.averagePrice),
		currentPrice,
		totalValue: currentPrice === null ? null : roundMoney(quantity * currentPrice),
		currency: position.asset.currency,
		exchange: position.asset.exchange,
	};

	return {
		report,
		calculationInput:
			currentPrice === null
				? null
				: {
						assetId: position.asset.id,
						ticker: position.asset.ticker,
						quantity,
						currentPrice,
						riskCategory,
						segment: segment ?? undefined,
					},
	};
}

function isPresent<T>(value: T | null): value is T {
	return value !== null;
}

function toCashAccountInput(account: ReportCashAccountData): PortfolioCashAccountInput {
	return {
		id: account.name,
		name: account.name,
		balance: decimalToNumber(account.balance),
		type: account.type,
		liquidity: account.liquidity ?? undefined,
	};
}

function toCashAccountReport(account: ReportCashAccountData): Record<string, unknown> {
	return {
		name: account.name,
		type: account.type,
		balance: decimalToNumber(account.balance),
		liquidity: account.liquidity,
		benchmark: account.benchmark,
		benchmarkPercent: decimalToNullableNumber(account.benchmarkPercent),
	};
}

function toContributionPlanReport(plan: ReportContributionPlanData): Record<string, unknown> {
	return {
		amount: decimalToNumber(plan.amount),
		frequency: plan.frequency.toLowerCase(),
		dayOfMonth: plan.dayOfMonth,
		startsAt: toDateOnly(plan.startsAt),
		endsAt: plan.endsAt ? toDateOnly(plan.endsAt) : null,
		defaultStrategyId: plan.defaultStrategyId,
		cashAccountName: plan.cashAccount?.name ?? null,
	};
}

function toContributionCycleReport(cycle: ReportContributionCycleData): Record<string, unknown> {
	return {
		cycleMonth: toCycleMonth(cycle.cycleMonth),
		plannedAmount: decimalToNumber(cycle.plannedAmount),
		confirmedAmount: decimalToNullableNumber(cycle.confirmedAmount),
		status: cycle.status.toLowerCase(),
		strategyId: cycle.strategyId,
		reportRecommendedAt: cycle.reportRecommendedAt?.toISOString() ?? null,
		reportRecommendationReason: cycle.reportRecommendationReason,
	};
}

function getReportStrategy(data: ReportPortfolioData) {
	return getStrategyById(readKnownStrategyId(readReportStrategyId(data)));
}

function readReportStrategyId(data: ReportPortfolioData): string {
	return (
		data.contributionCycles[0]?.strategyId ??
		data.contributionPlans[0]?.defaultStrategyId ??
		strategyIds.balancedGrowth
	);
}

function readKnownStrategyId(value: string): StrategyId {
	return Object.values(strategyIds).includes(value as StrategyId)
		? (value as StrategyId)
		: strategyIds.balancedGrowth;
}

function readReportStrategyIdFromEnvelope(report: ReportEnvelope): string | null {
	const strategyId = report.strategy.id;
	return typeof strategyId === "string" ? strategyId : null;
}

function toAssetType(value: Uppercase<AssetType>): AssetType {
	return value.toLowerCase() as AssetType;
}

function toRiskCategory(value: Uppercase<RiskCategory>): RiskCategory {
	return value.toLowerCase() as RiskCategory;
}

function decimalToNumber(value: DecimalValue): number {
	return Number(value.toString());
}

function decimalToNullableNumber(value: DecimalValue | null): number | null {
	return value === null ? null : decimalToNumber(value);
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, DATE_ONLY_LENGTH);
}

function toCycleMonth(value: Date): string {
	return value.toISOString().slice(0, CYCLE_MONTH_LENGTH);
}

function toPrismaJson(report: ReportEnvelope): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue;
}

function toSavedReportMetadataResponse(
	report: SavedReportMetadataData,
): SavedReportMetadataResponse {
	return {
		id: report.id,
		schemaVersion: report.schemaVersion,
		generatedAt: report.generatedAt.toISOString(),
		strategyId: report.strategyId,
		alertCount: report.alertCount,
		createdAt: report.createdAt.toISOString(),
	};
}

function toSavedReportContentResponse(report: SavedReportContentData): SavedReportContentResponse {
	return {
		...toSavedReportMetadataResponse(report),
		json: readSavedJsonReport(report.jsonReport),
		markdown: report.markdownReport,
	};
}

function readSavedJsonReport(value: Prisma.JsonValue): ReportEnvelope {
	if (validateJsonReport(value)) {
		return value;
	}

	throw new InternalServerErrorException("Saved report JSON is invalid");
}
