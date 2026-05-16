import { Injectable } from "@nestjs/common";
import { type Position, Prisma } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type { CreatePositionDto, UpdatePositionDto } from "./position.dto.js";

const POSITION_LIST_LIMIT = 200;

export type CreatePositionResult =
	| { status: "created"; position: Position }
	| { status: "not-found" };

@Injectable()
export class PositionRepository {
	async createByUser(
		userId: string,
		portfolioId: string,
		data: CreatePositionDto,
	): Promise<CreatePositionResult> {
		const [portfolio, asset] = await prisma.$transaction([
			prisma.portfolio.findUnique({
				where: {
					id_userId: {
						id: portfolioId,
						userId,
					},
				},
				select: {
					id: true,
				},
			}),
			prisma.asset.findUnique({
				where: {
					id: data.assetId,
				},
				select: {
					id: true,
				},
			}),
		]);

		if (!portfolio || !asset) {
			return {
				status: "not-found",
			};
		}

		try {
			const position = await prisma.position.create({
				data: {
					userId,
					portfolioId,
					assetId: data.assetId,
					quantity: data.quantity,
					averagePrice: data.averagePrice,
					manualCurrentPrice: data.manualCurrentPrice,
					notes: data.notes,
				},
			});

			return {
				status: "created",
				position,
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

	async findManyByPortfolio(userId: string, portfolioId: string): Promise<Position[] | null> {
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

		return prisma.position.findMany({
			where: {
				userId,
				portfolioId,
			},
			take: POSITION_LIST_LIMIT,
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

	findByUser(userId: string, positionId: string): Promise<Position | null> {
		return prisma.position.findFirst({
			where: {
				id: positionId,
				userId,
			},
		});
	}

	async updateByUser(
		userId: string,
		positionId: string,
		data: UpdatePositionDto,
	): Promise<Position | null> {
		const result = await prisma.position.updateMany({
			where: {
				id: positionId,
				userId,
			},
			data,
		});

		if (result.count === 0) {
			return null;
		}

		return this.findByUser(userId, positionId);
	}
}
