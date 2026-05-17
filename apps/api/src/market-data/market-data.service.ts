import {
	BrapiMarketDataProvider,
	ManualMarketDataProvider,
	MarketDataProviderError,
	type QuoteSnapshot,
} from "@decision-board/market-data";
import {
	BadGatewayException,
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import type { PriceSnapshot, Prisma } from "@prisma/client";
import type { CreateManualPriceSnapshotDto, PriceSnapshotSearchDto } from "./market-data.dto.js";
import { MarketDataRepository } from "./market-data.repository.js";

const BRAPI_PROVIDER_ID = "brapi";
const MARKET_DATA_PROVIDER_ENV = "MARKET_DATA_PROVIDER";
const BRAPI_TOKEN_ENV = "BRAPI_TOKEN";
const BRAPI_API_BASE_URL_ENV = "BRAPI_API_BASE_URL";
const BRAPI_TIMEOUT_MS_ENV = "BRAPI_TIMEOUT_MS";
const MIN_BRAPI_TIMEOUT_MS = 1;
const MAX_BRAPI_TIMEOUT_MS = 30000;
const REFRESH_RATE_LIMIT_PREFIX = "market-data-refresh";
const REFRESH_RATE_LIMIT_WINDOW_MS = 60_000;

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
	private readonly externalProvider = createExternalMarketDataProvider();

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

	async refreshPriceSnapshotFromProvider(
		userId: string,
		assetId: string,
	): Promise<PriceSnapshotResponse> {
		if (!this.externalProvider) {
			throw new ServiceUnavailableException(
				"External market data provider is not enabled; use manual price snapshots",
			);
		}

		const asset = await this.marketData.findAsset(assetId);

		if (!asset) {
			throw new NotFoundException("Asset not found");
		}

		await this.assertRefreshAllowed(userId, asset.id);

		let quoteSnapshot: QuoteSnapshot | null;
		try {
			quoteSnapshot = await this.externalProvider.getQuote(asset.ticker);
		} catch (error) {
			if (error instanceof MarketDataProviderError) {
				throw new BadGatewayException(error.message);
			}

			throw error;
		}

		if (!quoteSnapshot) {
			throw new NotFoundException("Quote not found");
		}

		if (quoteSnapshot.ticker !== asset.ticker) {
			throw new BadGatewayException("External quote ticker does not match the requested asset");
		}

		if (quoteSnapshot.currency !== asset.currency) {
			throw new BadGatewayException("External quote currency does not match the asset currency");
		}

		const priceSnapshot = await this.marketData.createManualPriceSnapshot({
			userId,
			assetId: asset.id,
			price: quoteSnapshot.price,
			currency: quoteSnapshot.currency,
			provider: quoteSnapshot.provider,
			capturedAt: quoteSnapshot.capturedAt,
			rawPayloadJson: toSafeJsonValue(quoteSnapshot.rawPayload),
		});

		return toPriceSnapshotResponse(priceSnapshot);
	}

	private async assertRefreshAllowed(userId: string, assetId: string): Promise<void> {
		const now = Date.now();
		const windowStartedAt =
			now - (now % REFRESH_RATE_LIMIT_WINDOW_MS) + REFRESH_RATE_LIMIT_WINDOW_MS;
		const inserted = await this.marketData.tryCreateRefreshRateLimit({
			key: `${REFRESH_RATE_LIMIT_PREFIX}:${userId}:${assetId}:${windowStartedAt}`,
			windowStartedAt: BigInt(windowStartedAt),
		});

		if (!inserted) {
			throw new ConflictException("Market data refresh already requested for this asset");
		}
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

function createExternalMarketDataProvider(): BrapiMarketDataProvider | null {
	if (process.env[MARKET_DATA_PROVIDER_ENV] !== BRAPI_PROVIDER_ID) {
		return null;
	}

	return new BrapiMarketDataProvider({
		token: process.env[BRAPI_TOKEN_ENV],
		baseUrl: parseBrapiBaseUrl(process.env[BRAPI_API_BASE_URL_ENV]),
		timeoutMs: parseBrapiTimeoutMs(process.env[BRAPI_TIMEOUT_MS_ENV]),
	});
}

function parseBrapiBaseUrl(value: string | undefined): string | undefined {
	if (value === undefined || value.trim() === "") {
		return undefined;
	}

	const url = new URL(value);
	if (url.protocol === "https:" || isLoopbackHttpUrl(url)) {
		return url.toString();
	}

	throw new Error(`${BRAPI_API_BASE_URL_ENV} must use https or loopback http for tests`);
}

function parseBrapiTimeoutMs(value: string | undefined): number | undefined {
	if (value === undefined || value.trim() === "") {
		return undefined;
	}

	const timeoutMs = Number(value);
	if (
		!Number.isInteger(timeoutMs) ||
		timeoutMs < MIN_BRAPI_TIMEOUT_MS ||
		timeoutMs > MAX_BRAPI_TIMEOUT_MS
	) {
		throw new Error(
			`${BRAPI_TIMEOUT_MS_ENV} must be an integer from ${MIN_BRAPI_TIMEOUT_MS} to ${MAX_BRAPI_TIMEOUT_MS}`,
		);
	}

	return timeoutMs;
}

function toSafeJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}

	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isLoopbackHttpUrl(url: URL): boolean {
	return (
		url.protocol === "http:" &&
		(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
	);
}
