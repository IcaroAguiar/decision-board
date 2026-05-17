import { type ContributionCycleStatus, contributionCycleStatuses } from "@decision-board/types";
import { Injectable } from "@nestjs/common";
import { type ContributionCycle, Prisma } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type {
	CreateContributionCycleDto,
	UpdateContributionCycleDto,
} from "./contribution-cycle.dto.js";

const CONTRIBUTION_CYCLE_LIST_LIMIT = 200;

type ContributionPlanReference = {
	id: string;
	portfolioId: string;
	amount: Prisma.Decimal;
	defaultStrategyId: string;
};

export type CreateContributionCycleResult =
	| { status: "created"; contributionCycle: ContributionCycle }
	| { status: "not-found" }
	| { status: "duplicate" };

export type UpdateContributionCycleResult =
	| { status: "updated"; contributionCycle: ContributionCycle }
	| { status: "not-found" };

@Injectable()
export class ContributionCycleRepository {
	async createByUser(
		userId: string,
		contributionPlanId: string,
		data: CreateContributionCycleDto,
	): Promise<CreateContributionCycleResult> {
		const contributionPlan = await this.findPlanByUser(userId, contributionPlanId);

		if (!contributionPlan) {
			return {
				status: "not-found",
			};
		}

		const cycleMonth = toCycleMonthDate(data.cycleMonth);
		const existingCycle = await prisma.contributionCycle.findUnique({
			where: {
				contributionPlanId_cycleMonth: {
					contributionPlanId,
					cycleMonth,
				},
			},
			select: {
				id: true,
			},
		});

		if (existingCycle) {
			return {
				status: "duplicate",
			};
		}

		try {
			const contributionCycle = await prisma.contributionCycle.create({
				data: {
					userId,
					portfolioId: contributionPlan.portfolioId,
					contributionPlanId,
					cycleMonth,
					plannedAmount: contributionPlan.amount,
					status: "PENDING",
					strategyId: data.strategyId ?? contributionPlan.defaultStrategyId,
				},
			});

			return {
				status: "created",
				contributionCycle,
			};
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === "P2002") {
					return {
						status: "duplicate",
					};
				}

				if (error.code === "P2003") {
					return {
						status: "not-found",
					};
				}
			}

			throw error;
		}
	}

	async findManyByPortfolio(
		userId: string,
		portfolioId: string,
	): Promise<ContributionCycle[] | null> {
		const portfolio = await this.findPortfolioByUser(userId, portfolioId);

		if (!portfolio) {
			return null;
		}

		return prisma.contributionCycle.findMany({
			where: {
				userId,
				portfolioId,
			},
			take: CONTRIBUTION_CYCLE_LIST_LIMIT,
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
		});
	}

	findByUser(userId: string, contributionCycleId: string): Promise<ContributionCycle | null> {
		return prisma.contributionCycle.findFirst({
			where: {
				id: contributionCycleId,
				userId,
			},
		});
	}

	async updateByUser(
		userId: string,
		contributionCycleId: string,
		data: UpdateContributionCycleDto,
	): Promise<UpdateContributionCycleResult> {
		const result = await prisma.contributionCycle.updateMany({
			where: {
				id: contributionCycleId,
				userId,
			},
			data: toUpdateData(data),
		});

		if (result.count === 0) {
			return {
				status: "not-found",
			};
		}

		const contributionCycle = await this.findByUser(userId, contributionCycleId);

		if (!contributionCycle) {
			return {
				status: "not-found",
			};
		}

		return {
			status: "updated",
			contributionCycle,
		};
	}

	private findPlanByUser(
		userId: string,
		contributionPlanId: string,
	): Promise<ContributionPlanReference | null> {
		return prisma.contributionPlan.findFirst({
			where: {
				id: contributionPlanId,
				userId,
			},
			select: {
				id: true,
				portfolioId: true,
				amount: true,
				defaultStrategyId: true,
			},
		});
	}

	private findPortfolioByUser(userId: string, portfolioId: string): Promise<{ id: string } | null> {
		return prisma.portfolio.findUnique({
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
	}
}

function toCycleMonthDate(cycleMonth: string): Date {
	return new Date(`${cycleMonth}-01T00:00:00.000Z`);
}

function toPrismaStatus(status: ContributionCycleStatus): ContributionCycle["status"] {
	switch (status) {
		case contributionCycleStatuses.pending:
			return "PENDING";
		case contributionCycleStatuses.confirmed:
			return "CONFIRMED";
		case contributionCycleStatuses.skipped:
			return "SKIPPED";
		case contributionCycleStatuses.reported:
			return "REPORTED";
		case contributionCycleStatuses.closed:
			return "CLOSED";
		default:
			throw new Error(`Unsupported contribution cycle status: ${status}`);
	}
}

function toUpdateData(
	data: UpdateContributionCycleDto,
): Prisma.ContributionCycleUncheckedUpdateManyInput {
	return {
		status: data.status && toPrismaStatus(data.status),
		confirmedAmount: data.confirmedAmount,
		strategyId: data.strategyId,
		notes: data.notes,
	};
}
