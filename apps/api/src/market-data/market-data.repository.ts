import { Injectable } from "@nestjs/common";
import type { Asset, PriceSnapshot, Prisma } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import type { PriceSnapshotSearchDto } from "./market-data.dto.js";

export type AssetForManualPriceSnapshot = Pick<Asset, "id" | "ticker" | "currency">;

export interface CreateManualPriceSnapshotData {
	userId: string;
	assetId: string;
	price: string;
	currency: string;
	provider: string;
	capturedAt: Date;
	rawPayloadJson?: Prisma.InputJsonValue;
}

export interface RefreshRateLimitData {
	key: string;
	windowStartedAt: bigint;
}

@Injectable()
export class MarketDataRepository {
	findAsset(assetId: string): Promise<AssetForManualPriceSnapshot | null> {
		return prisma.asset.findFirst({
			where: {
				id: assetId,
				isActive: true,
			},
			select: {
				id: true,
				ticker: true,
				currency: true,
			},
		});
	}

	createManualPriceSnapshot(data: CreateManualPriceSnapshotData): Promise<PriceSnapshot> {
		return prisma.priceSnapshot.create({
			data: {
				userId: data.userId,
				assetId: data.assetId,
				price: data.price,
				currency: data.currency,
				provider: data.provider,
				capturedAt: data.capturedAt,
				rawPayloadJson: data.rawPayloadJson,
			},
		});
	}

	listPriceSnapshotsByAsset(
		userId: string,
		assetId: string,
		filters: PriceSnapshotSearchDto,
	): Promise<PriceSnapshot[]> {
		return prisma.priceSnapshot.findMany({
			where: {
				userId,
				assetId,
			},
			take: filters.limit,
			orderBy: [
				{
					capturedAt: "desc",
				},
				{
					createdAt: "desc",
				},
			],
		});
	}

	async tryCreateRefreshRateLimit(data: RefreshRateLimitData): Promise<boolean> {
		const result = await prisma.rateLimit.createMany({
			data: {
				key: data.key,
				count: 1,
				lastRequest: data.windowStartedAt,
			},
			skipDuplicates: true,
		});

		return result.count === 1;
	}
}
