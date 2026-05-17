import { getStrategyById } from "@decision-board/strategies";
import type { StrategyId } from "@decision-board/types";
import { Injectable } from "@nestjs/common";
import type { ContributionPlan } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import {
	type CheckReportDueJobData,
	type CreateMonthlyContributionCyclesJobData,
	reportRecommendationReasons,
} from "./job-names.js";

const CYCLE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_REPORT_DUE_BATCH_SIZE = 500;
const MONTHLY_PLAN_BATCH_SIZE = 500;
const UTC_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const PRISMA_CONTRIBUTION_FREQUENCY_MONTHLY = "MONTHLY";
const PRISMA_CYCLE_STATUS_PENDING = "PENDING";
const PRISMA_CYCLE_STATUS_CONFIRMED = "CONFIRMED";

type ContributionPlanForCycle = Pick<
	ContributionPlan,
	"id" | "userId" | "portfolioId" | "amount" | "defaultStrategyId"
>;

export interface CreateMonthlyContributionCyclesResult {
	cycleMonth: string;
	consideredPlans: number;
	createdCycles: number;
}

export interface CheckReportDueResult {
	checkedCycles: number;
	markedCycles: number;
	skippedUnknownStrategies: number;
}

@Injectable()
export class JobsRepository {
	async createMonthlyContributionCycles(
		data: CreateMonthlyContributionCyclesJobData = {},
	): Promise<CreateMonthlyContributionCyclesResult> {
		const cycleMonth = normalizeCycleMonth(data.cycleMonth);
		const { firstDay, lastDay } = getCycleMonthRange(cycleMonth);
		let cursorId: string | undefined;
		let consideredPlans = 0;
		let createdCycles = 0;

		do {
			const contributionPlans = await this.findActiveMonthlyContributionPlans(
				firstDay,
				lastDay,
				cursorId,
			);
			consideredPlans += contributionPlans.length;

			const createResult = await prisma.contributionCycle.createMany({
				data: contributionPlans.map((contributionPlan) => ({
					userId: contributionPlan.userId,
					portfolioId: contributionPlan.portfolioId,
					contributionPlanId: contributionPlan.id,
					cycleMonth: firstDay,
					plannedAmount: contributionPlan.amount,
					status: PRISMA_CYCLE_STATUS_PENDING,
					strategyId: contributionPlan.defaultStrategyId,
				})),
				skipDuplicates: true,
			});
			createdCycles += createResult.count;
			cursorId =
				contributionPlans.length === MONTHLY_PLAN_BATCH_SIZE
					? contributionPlans.at(-1)?.id
					: undefined;
		} while (cursorId);

		return {
			cycleMonth,
			consideredPlans,
			createdCycles,
		};
	}

	async checkReportDue(data: CheckReportDueJobData = {}): Promise<CheckReportDueResult> {
		const now = normalizeNow(data.now);
		const today = startOfUtcDay(now);
		let cursorId: string | undefined;
		let checkedCycles = 0;
		let markedCycles = 0;
		let skippedUnknownStrategies = 0;

		do {
			const candidates = await this.findConfirmedCyclesPendingReportCheck(cursorId);
			checkedCycles += candidates.length;

			for (const candidate of candidates) {
				const reportDueAt = getReportDueAt(candidate.cycleMonth, candidate.strategyId);

				if (!reportDueAt) {
					skippedUnknownStrategies += 1;
					continue;
				}

				if (reportDueAt > today) {
					continue;
				}

				const result = await prisma.contributionCycle.updateMany({
					where: {
						id: candidate.id,
						userId: candidate.userId,
						portfolioId: candidate.portfolioId,
						status: PRISMA_CYCLE_STATUS_CONFIRMED,
						confirmedAmount: {
							not: null,
						},
						reportRecommendedAt: null,
					},
					data: {
						reportRecommendedAt: now,
						reportRecommendationReason: reportRecommendationReasons.strategyReportIntervalElapsed,
					},
				});

				markedCycles += result.count;
			}

			cursorId =
				candidates.length === MAX_REPORT_DUE_BATCH_SIZE ? candidates.at(-1)?.id : undefined;
		} while (cursorId);

		return {
			checkedCycles,
			markedCycles,
			skippedUnknownStrategies,
		};
	}

	private findActiveMonthlyContributionPlans(
		firstDay: Date,
		lastDay: Date,
		cursorId: string | undefined,
	): Promise<ContributionPlanForCycle[]> {
		return prisma.contributionPlan.findMany({
			where: {
				frequency: PRISMA_CONTRIBUTION_FREQUENCY_MONTHLY,
				isActive: true,
				startsAt: {
					lte: lastDay,
				},
				OR: [
					{
						endsAt: null,
					},
					{
						endsAt: {
							gte: firstDay,
						},
					},
				],
			},
			...(cursorId
				? {
						cursor: {
							id: cursorId,
						},
						skip: 1,
					}
				: {}),
			select: {
				id: true,
				userId: true,
				portfolioId: true,
				amount: true,
				defaultStrategyId: true,
			},
			take: MONTHLY_PLAN_BATCH_SIZE,
			orderBy: {
				id: "asc",
			},
		});
	}

	private findConfirmedCyclesPendingReportCheck(cursorId: string | undefined): Promise<
		{
			id: string;
			userId: string;
			portfolioId: string;
			cycleMonth: Date;
			strategyId: string;
		}[]
	> {
		return prisma.contributionCycle.findMany({
			where: {
				status: PRISMA_CYCLE_STATUS_CONFIRMED,
				confirmedAmount: {
					not: null,
				},
				reportRecommendedAt: null,
				...(cursorId
					? {
							id: {
								gt: cursorId,
							},
						}
					: {}),
			},
			select: {
				id: true,
				userId: true,
				portfolioId: true,
				cycleMonth: true,
				strategyId: true,
			},
			take: MAX_REPORT_DUE_BATCH_SIZE,
			orderBy: {
				id: "asc",
			},
		});
	}
}

function normalizeCycleMonth(cycleMonth: string | undefined): string {
	const value = cycleMonth ?? new Date().toISOString().slice(0, 7);

	if (!CYCLE_MONTH_PATTERN.test(value)) {
		throw new Error("cycleMonth must be a YYYY-MM month");
	}

	return value;
}

function normalizeNow(now: string | undefined): Date {
	const value = now === undefined ? new Date() : new Date(now);

	if (Number.isNaN(value.getTime())) {
		throw new Error("now must be a valid ISO timestamp");
	}

	return value;
}

function getCycleMonthRange(cycleMonth: string): { firstDay: Date; lastDay: Date } {
	const [yearText, monthText] = cycleMonth.split("-");
	const year = Number(yearText);
	const month = Number(monthText);

	return {
		firstDay: new Date(Date.UTC(year, month - 1, 1)),
		lastDay: new Date(Date.UTC(year, month, 0)),
	};
}

function getReportDueAt(cycleMonth: Date, strategyId: string): Date | null {
	try {
		const strategy = getStrategyById(strategyId as StrategyId);
		const cycleStart = startOfUtcDay(cycleMonth);

		return new Date(cycleStart.getTime() + strategy.reportIntervalDays * UTC_DAY_IN_MILLISECONDS);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Unknown strategy:")) {
			return null;
		}

		throw error;
	}
}

function startOfUtcDay(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function toCycleMonthDate(cycleMonth: string): Date {
	return getCycleMonthRange(normalizeCycleMonth(cycleMonth)).firstDay;
}
