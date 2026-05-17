import { Injectable } from "@nestjs/common";
import { type ContributionPlan, Prisma } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type {
	CreateContributionPlanDto,
	UpdateContributionPlanDto,
} from "./contribution-plan.dto.js";

const CONTRIBUTION_PLAN_LIST_LIMIT = 200;

export type CreateContributionPlanResult =
	| { status: "created"; contributionPlan: ContributionPlan }
	| { status: "not-found" };

export type UpdateContributionPlanResult =
	| { status: "updated"; contributionPlan: ContributionPlan }
	| { status: "not-found" };

@Injectable()
export class ContributionPlanRepository {
	async createByUser(
		userId: string,
		portfolioId: string,
		data: CreateContributionPlanDto,
	): Promise<CreateContributionPlanResult> {
		const ownsReferences = await this.ownsPortfolioAndCashAccount(
			userId,
			portfolioId,
			data.cashAccountId,
		);

		if (!ownsReferences) {
			return {
				status: "not-found",
			};
		}

		try {
			const contributionPlan = await prisma.contributionPlan.create({
				data: {
					userId,
					portfolioId,
					amount: data.amount,
					frequency: toPrismaFrequency(data.frequency),
					dayOfMonth: data.dayOfMonth,
					startsAt: toDate(data.startsAt),
					endsAt: data.endsAt === undefined ? undefined : data.endsAt && toDate(data.endsAt),
					isActive: data.isActive,
					defaultStrategyId: data.defaultStrategyId,
					cashAccountId: data.cashAccountId,
				},
			});

			return {
				status: "created",
				contributionPlan,
			};
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
				return {
					status: "not-found",
				};
			}

			throw error;
		}
	}

	async findActiveByPortfolio(
		userId: string,
		portfolioId: string,
	): Promise<ContributionPlan[] | null> {
		const portfolio = await this.findPortfolioByUser(userId, portfolioId);

		if (!portfolio) {
			return null;
		}

		return prisma.contributionPlan.findMany({
			where: {
				userId,
				portfolioId,
				isActive: true,
			},
			take: CONTRIBUTION_PLAN_LIST_LIMIT,
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
		});
	}

	findByUser(userId: string, contributionPlanId: string): Promise<ContributionPlan | null> {
		return prisma.contributionPlan.findFirst({
			where: {
				id: contributionPlanId,
				userId,
			},
		});
	}

	async updateByUser(
		userId: string,
		contributionPlanId: string,
		data: UpdateContributionPlanDto,
	): Promise<UpdateContributionPlanResult> {
		const existing = await this.findByUser(userId, contributionPlanId);

		if (!existing) {
			return {
				status: "not-found",
			};
		}

		if (data.cashAccountId !== undefined) {
			const ownsCashAccount = await this.ownsCashAccount(
				userId,
				existing.portfolioId,
				data.cashAccountId,
			);

			if (!ownsCashAccount) {
				return {
					status: "not-found",
				};
			}
		}

		try {
			const result = await prisma.contributionPlan.updateMany({
				where: {
					id: contributionPlanId,
					userId,
				},
				data: toUpdateData(data),
			});

			if (result.count === 0) {
				return {
					status: "not-found",
				};
			}

			const contributionPlan = await this.findByUser(userId, contributionPlanId);

			if (!contributionPlan) {
				return {
					status: "not-found",
				};
			}

			return {
				status: "updated",
				contributionPlan,
			};
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
				return {
					status: "not-found",
				};
			}

			throw error;
		}
	}

	private async ownsPortfolioAndCashAccount(
		userId: string,
		portfolioId: string,
		cashAccountId: string | null | undefined,
	): Promise<boolean> {
		const portfolio = await this.findPortfolioByUser(userId, portfolioId);
		if (!portfolio) {
			return false;
		}

		return this.ownsCashAccount(userId, portfolioId, cashAccountId);
	}

	private async findPortfolioByUser(
		userId: string,
		portfolioId: string,
	): Promise<{ id: string } | null> {
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

	private async ownsCashAccount(
		userId: string,
		portfolioId: string,
		cashAccountId: string | null | undefined,
	): Promise<boolean> {
		if (cashAccountId === undefined || cashAccountId === null) {
			return true;
		}

		const cashAccount = await prisma.cashAccount.findFirst({
			where: {
				id: cashAccountId,
				userId,
				portfolioId,
			},
			select: {
				id: true,
			},
		});

		return Boolean(cashAccount);
	}
}

function toDate(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`);
}

function toPrismaFrequency(frequency: "monthly"): "MONTHLY" {
	if (frequency !== "monthly") {
		throw new Error(`Unsupported contribution frequency: ${frequency}`);
	}

	return "MONTHLY";
}

function toUpdateData(
	data: UpdateContributionPlanDto,
): Prisma.ContributionPlanUncheckedUpdateManyInput {
	return {
		amount: data.amount,
		frequency: data.frequency && toPrismaFrequency(data.frequency),
		dayOfMonth: data.dayOfMonth,
		startsAt: data.startsAt && toDate(data.startsAt),
		endsAt: data.endsAt === undefined ? undefined : data.endsAt && toDate(data.endsAt),
		isActive: data.isActive,
		defaultStrategyId: data.defaultStrategyId,
		cashAccountId: data.cashAccountId,
	};
}
