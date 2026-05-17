import { ManualMarketDataProvider } from "@decision-board/market-data";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PriceSnapshot } from "@prisma/client";
import type { CreateManualPriceSnapshotDto, PriceSnapshotSearchDto } from "./market-data.dto.js";
import { MarketDataRepository } from "./market-data.repository.js";

export interface PriceSnapshotResponse {
	id: string;
	assetId: string;
	price: string;
	currency: string;
	provider: string;
	capturedAt: string;
	createdAt: string;
}

@Injectable()
export class MarketDataService {
	private readonly manualProvider = new ManualMarketDataProvider();

	constructor(
		@Inject(MarketDataRepository)
		private readonly marketData: MarketDataRepository,
	) {}

	async createManualPriceSnapshot(
		userId: string,
		assetId: string,
		data: CreateManualPriceSnapshotDto,
	): Promise<PriceSnapshotResponse> {
		const asset = await this.marketData.findAsset(assetId);

		if (!asset) {
			throw new NotFoundException("Asset not found");
		}

		const currency = data.currency ?? asset.currency;
		if (currency !== asset.currency) {
			throw new BadRequestException("currency must match the asset currency");
		}

		const quoteSnapshot = this.manualProvider.createQuoteSnapshot({
			ticker: asset.ticker,
			price: data.price,
			currency,
			capturedAt: data.capturedAt ? new Date(data.capturedAt) : undefined,
		});

		const priceSnapshot = await this.marketData.createManualPriceSnapshot({
			userId,
			assetId: asset.id,
			price: quoteSnapshot.price,
			currency: quoteSnapshot.currency,
			provider: quoteSnapshot.provider,
			capturedAt: quoteSnapshot.capturedAt,
		});

		return toPriceSnapshotResponse(priceSnapshot);
	}

	async listPriceSnapshots(
		userId: string,
		assetId: string,
		filters: PriceSnapshotSearchDto,
	): Promise<PriceSnapshotResponse[]> {
		const asset = await this.marketData.findAsset(assetId);

		if (!asset) {
			throw new NotFoundException("Asset not found");
		}

		const priceSnapshots = await this.marketData.listPriceSnapshotsByAsset(
			userId,
			assetId,
			filters,
		);

		return priceSnapshots.map(toPriceSnapshotResponse);
	}
}

function toPriceSnapshotResponse(priceSnapshot: PriceSnapshot): PriceSnapshotResponse {
	return {
		id: priceSnapshot.id,
		assetId: priceSnapshot.assetId,
		price: priceSnapshot.price.toString(),
		currency: priceSnapshot.currency,
		provider: priceSnapshot.provider,
		capturedAt: priceSnapshot.capturedAt.toISOString(),
		createdAt: priceSnapshot.createdAt.toISOString(),
	};
}
