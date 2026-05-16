import { Injectable } from "@nestjs/common";
import { type CashAccount, Prisma } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type { CreateCashAccountDto, UpdateCashAccountDto } from "./cash-account.dto.js";

const CASH_ACCOUNT_LIST_LIMIT = 200;

export type CreateCashAccountResult =
	| { status: "created"; cashAccount: CashAccount }
	| { status: "not-found" };

@Injectable()
export class CashAccountRepository {
	async createByUser(
		userId: string,
		portfolioId: string,
		data: CreateCashAccountDto,
	): Promise<CreateCashAccountResult> {
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
			return {
				status: "not-found",
			};
		}

		try {
			const cashAccount = await prisma.cashAccount.create({
				data: {
					userId,
					portfolioId,
					name: data.name,
					type: data.type,
					balance: data.balance,
					liquidity: data.liquidity,
					benchmark: data.benchmark,
					benchmarkPercent: data.benchmarkPercent,
					notes: data.notes,
				},
			});

			return {
				status: "created",
				cashAccount,
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

	async findManyByPortfolio(userId: string, portfolioId: string): Promise<CashAccount[] | null> {
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

		return prisma.cashAccount.findMany({
			where: {
				userId,
				portfolioId,
			},
			take: CASH_ACCOUNT_LIST_LIMIT,
			orderBy: [
				{
					createdAt: "asc",
				},
				{
					id: "asc",
				},
			],
		});
	}

	findByUser(userId: string, cashAccountId: string): Promise<CashAccount | null> {
		return prisma.cashAccount.findFirst({
			where: {
				id: cashAccountId,
				userId,
			},
		});
	}

	async updateByUser(
		userId: string,
		cashAccountId: string,
		data: UpdateCashAccountDto,
	): Promise<CashAccount | null> {
		const result = await prisma.cashAccount.updateMany({
			where: {
				id: cashAccountId,
				userId,
			},
			data,
		});

		if (result.count === 0) {
			return null;
		}

		return this.findByUser(userId, cashAccountId);
	}
}
