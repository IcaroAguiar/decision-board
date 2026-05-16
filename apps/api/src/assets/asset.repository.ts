import { Injectable } from "@nestjs/common";
import { type Asset, AssetType, RiskCategory, type UserAssetOverride } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type { AssetSearchDto, CreateAssetDto, UpsertAssetOverrideDto } from "./asset.dto.js";

export const PRISMA_FOREIGN_KEY_CONSTRAINT_ERROR = "P2003";

export type AssetWithUserOverride = Asset & {
	userAssetOverrides: UserAssetOverride[];
};

@Injectable()
export class AssetRepository {
	findOrCreateCanonical(data: CreateAssetDto): Promise<Asset> {
		return prisma.asset.upsert({
			where: {
				ticker_exchange_currency: {
					ticker: data.ticker,
					exchange: data.exchange,
					currency: data.currency,
				},
			},
			create: {
				ticker: data.ticker,
				name: data.ticker,
				assetType: AssetType.OTHER,
				riskCategory: RiskCategory.OTHER,
				segment: null,
				currency: data.currency,
				exchange: data.exchange,
			},
			update: {},
		});
	}

	findManyForUser(userId: string, filters: AssetSearchDto): Promise<AssetWithUserOverride[]> {
		return prisma.asset.findMany({
			where: {
				isActive: true,
				...(filters.ticker
					? {
							ticker: {
								contains: filters.ticker,
							},
						}
					: {}),
				...(filters.q
					? {
							OR: [
								{
									ticker: {
										contains: filters.q.toUpperCase(),
									},
								},
								{
									name: {
										contains: filters.q,
										mode: "insensitive",
									},
								},
							],
						}
					: {}),
			},
			include: userOverrideInclude(userId),
			take: filters.limit,
			orderBy: [
				{
					ticker: "asc",
				},
				{
					exchange: "asc",
				},
			],
		});
	}

	findByIdForUser(userId: string, assetId: string): Promise<AssetWithUserOverride | null> {
		return prisma.asset.findUnique({
			where: {
				id: assetId,
			},
			include: userOverrideInclude(userId),
		});
	}

	async upsertOverride(
		userId: string,
		assetId: string,
		data: UpsertAssetOverrideDto,
	): Promise<AssetWithUserOverride | null> {
		try {
			await prisma.userAssetOverride.upsert({
				where: {
					userId_assetId: {
						userId,
						assetId,
					},
				},
				create: {
					userId,
					assetId,
					...data,
				},
				update: data,
			});
		} catch (error) {
			if (isForeignKeyError(error)) {
				return null;
			}

			throw error;
		}

		return this.findByIdForUser(userId, assetId);
	}
}

function isForeignKeyError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === PRISMA_FOREIGN_KEY_CONSTRAINT_ERROR
	);
}

function userOverrideInclude(userId: string) {
	return {
		userAssetOverrides: {
			where: {
				userId,
			},
			take: 1,
		},
	} as const;
}
