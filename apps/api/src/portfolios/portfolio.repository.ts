import { Injectable } from "@nestjs/common";
import { type Portfolio, Prisma } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type { CreatePortfolioDto, UpdatePortfolioDto } from "./portfolio.dto.js";

export type DeletePortfolioResult = "deleted" | "not-found" | "not-empty";

@Injectable()
export class PortfolioRepository {
	create(userId: string, data: CreatePortfolioDto): Promise<Portfolio> {
		return prisma.portfolio.create({
			data: {
				userId,
				name: data.name,
				baseCurrency: data.baseCurrency,
			},
		});
	}

	findManyByUser(userId: string): Promise<Portfolio[]> {
		return prisma.portfolio.findMany({
			where: {
				userId,
			},
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

	findByUser(userId: string, portfolioId: string): Promise<Portfolio | null> {
		return prisma.portfolio.findUnique({
			where: {
				id_userId: {
					id: portfolioId,
					userId,
				},
			},
		});
	}

	async updateByUser(
		userId: string,
		portfolioId: string,
		data: UpdatePortfolioDto,
	): Promise<Portfolio | null> {
		const result = await prisma.portfolio.updateMany({
			where: {
				id: portfolioId,
				userId,
			},
			data,
		});

		if (result.count === 0) {
			return null;
		}

		return this.findByUser(userId, portfolioId);
	}

	async deleteEmptyByUser(userId: string, portfolioId: string): Promise<DeletePortfolioResult> {
		const portfolio = await prisma.portfolio.findUnique({
			where: {
				id_userId: {
					id: portfolioId,
					userId,
				},
			},
			select: {
				id: true,
				_count: {
					select: {
						positions: true,
						cashAccounts: true,
						reports: true,
					},
				},
			},
		});

		if (!portfolio) {
			return "not-found";
		}

		if (
			portfolio._count.positions > 0 ||
			portfolio._count.cashAccounts > 0 ||
			portfolio._count.reports > 0
		) {
			return "not-empty";
		}

		try {
			await prisma.portfolio.delete({
				where: {
					id_userId: {
						id: portfolio.id,
						userId,
					},
				},
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
				return "not-empty";
			}

			throw error;
		}

		return "deleted";
	}
}
