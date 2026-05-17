import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
	BadGatewayException,
	ConflictException,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { type PriceSnapshot, Prisma } from "@prisma/client";
import { createMockHttpServer, sendJson } from "../test/mock-http-server.js";
import { MarketDataService } from "./market-data.service.js";

const USER_ID = "user-market-data-service";
const ASSET_ID = "asset-market-data-service";
const ASSET_TICKER = "MDS12345";
const ASSET_CURRENCY = "BRL";
const PROVIDER_ENV_NAME = "MARKET_DATA_PROVIDER";
const BRAPI_BASE_URL_ENV_NAME = "BRAPI_API_BASE_URL";
const BRAPI_TIMEOUT_MS_ENV_NAME = "BRAPI_TIMEOUT_MS";
const BRAPI_TOKEN_ENV_NAME = "BRAPI_TOKEN";
const BRAPI_PROVIDER_ID = "brapi";
const MANUAL_PROVIDER_ID = "manual";
const TEST_PRICE = "123.45";
const TEST_CAPTURED_AT = new Date("2026-05-17T13:00:00.000Z");
const TEST_CREATED_AT = new Date("2026-05-17T13:01:00.000Z");

interface MarketDataEnvSnapshot {
	BRAPI_API_BASE_URL: string | undefined;
	BRAPI_TIMEOUT_MS: string | undefined;
	BRAPI_TOKEN: string | undefined;
	MARKET_DATA_PROVIDER: string | undefined;
}

interface FakeAsset {
	id: string;
	ticker: string;
	currency: string;
}

interface CreateSnapshotInput {
	userId: string;
	assetId: string;
	price: string;
	currency: string;
	provider: string;
	capturedAt: Date;
	rawPayloadJson?: Prisma.InputJsonValue;
}

class FakeMarketDataRepository {
	asset: FakeAsset | null = {
		id: ASSET_ID,
		ticker: ASSET_TICKER,
		currency: ASSET_CURRENCY,
	};
	priceSnapshots: PriceSnapshot[] = [];
	refreshAllowed = true;
	createdSnapshots: CreateSnapshotInput[] = [];
	refreshKeys: string[] = [];

	async findAsset(_assetId: string): Promise<FakeAsset | null> {
		return this.asset;
	}

	async createManualPriceSnapshot(data: CreateSnapshotInput): Promise<PriceSnapshot> {
		this.createdSnapshots.push(data);
		const snapshot = makePriceSnapshot(data);
		this.priceSnapshots.unshift(snapshot);
		return snapshot;
	}

	async listPriceSnapshotsByAsset(): Promise<PriceSnapshot[]> {
		return this.priceSnapshots;
	}

	async tryCreateRefreshRateLimit(data: { key: string }): Promise<boolean> {
		this.refreshKeys.push(data.key);
		return this.refreshAllowed;
	}
}

function makePriceSnapshot(input: CreateSnapshotInput): PriceSnapshot {
	return {
		id: randomUUID(),
		userId: input.userId,
		assetId: input.assetId,
		price: new Prisma.Decimal(input.price),
		currency: input.currency,
		provider: input.provider,
		capturedAt: input.capturedAt,
		rawPayloadJson:
			input.rawPayloadJson === undefined ? null : (input.rawPayloadJson as Prisma.JsonValue),
		createdAt: TEST_CREATED_AT,
	};
}

function captureMarketDataEnv(): MarketDataEnvSnapshot {
	return {
		BRAPI_API_BASE_URL: process.env[BRAPI_BASE_URL_ENV_NAME],
		BRAPI_TIMEOUT_MS: process.env[BRAPI_TIMEOUT_MS_ENV_NAME],
		BRAPI_TOKEN: process.env[BRAPI_TOKEN_ENV_NAME],
		MARKET_DATA_PROVIDER: process.env[PROVIDER_ENV_NAME],
	};
}

function restoreMarketDataEnv(snapshot: MarketDataEnvSnapshot): void {
	for (const [name, value] of Object.entries(snapshot)) {
		if (value === undefined) {
			delete process.env[name];
			continue;
		}

		process.env[name] = value;
	}
}

function createService(repository: FakeMarketDataRepository): MarketDataService {
	return new MarketDataService(repository as never);
}

test("creates manual snapshots with asset defaults and lists stored responses", async () => {
	const repository = new FakeMarketDataRepository();
	delete process.env[PROVIDER_ENV_NAME];
	const service = createService(repository);

	const created = await service.createManualPriceSnapshot(USER_ID, ASSET_ID, {
		price: TEST_PRICE,
		capturedAt: TEST_CAPTURED_AT.toISOString(),
	});
	const listed = await service.listPriceSnapshots(USER_ID, ASSET_ID, { limit: 20 });

	assert.equal(created.assetId, ASSET_ID);
	assert.equal(created.price, TEST_PRICE);
	assert.equal(created.currency, ASSET_CURRENCY);
	assert.equal(created.provider, MANUAL_PROVIDER_ID);
	assert.equal(created.capturedAt, TEST_CAPTURED_AT.toISOString());
	assert.deepEqual(
		listed.map((snapshot) => snapshot.id),
		[created.id],
	);
	assert.equal(repository.createdSnapshots[0]?.rawPayloadJson, undefined);
});

test("rejects manual snapshots and lists when the asset cannot be resolved", async () => {
	const repository = new FakeMarketDataRepository();
	repository.asset = null;
	const service = createService(repository);

	await assert.rejects(
		() => service.createManualPriceSnapshot(USER_ID, ASSET_ID, { price: TEST_PRICE }),
		NotFoundException,
	);
	await assert.rejects(
		() => service.listPriceSnapshots(USER_ID, ASSET_ID, { limit: 20 }),
		NotFoundException,
	);
});

test("enforces refresh rate limits before calling the optional provider", async () => {
	const env = captureMarketDataEnv();
	let providerRequestCount = 0;
	const brapi = await createMockHttpServer((_request, response) => {
		providerRequestCount += 1;
		sendJson(response, 200, {
			results: [
				{
					symbol: ASSET_TICKER,
					regularMarketPrice: 1,
					currency: ASSET_CURRENCY,
				},
			],
		});
	});
	process.env[PROVIDER_ENV_NAME] = BRAPI_PROVIDER_ID;
	process.env[BRAPI_BASE_URL_ENV_NAME] = brapi.baseUrl;
	process.env[BRAPI_TIMEOUT_MS_ENV_NAME] = "1000";
	delete process.env[BRAPI_TOKEN_ENV_NAME];

	const repository = new FakeMarketDataRepository();
	repository.refreshAllowed = false;
	const service = createService(repository);

	try {
		await assert.rejects(
			() => service.refreshPriceSnapshotFromProvider(USER_ID, ASSET_ID),
			ConflictException,
		);
		assert.equal(repository.createdSnapshots.length, 0);
		assert.equal(repository.refreshKeys.length, 1);
		assert.equal(providerRequestCount, 0);
	} finally {
		await brapi.close();
		restoreMarketDataEnv(env);
	}
});

test("maps optional provider failure, missing quote, and mismatched quote responses", async () => {
	const env = captureMarketDataEnv();

	try {
		delete process.env[PROVIDER_ENV_NAME];
		await assert.rejects(
			() =>
				createService(new FakeMarketDataRepository()).refreshPriceSnapshotFromProvider(
					USER_ID,
					ASSET_ID,
				),
			ServiceUnavailableException,
		);

		await assertProviderResponse(
			{ status: 500, payload: { error: "provider unavailable" } },
			BadGatewayException,
		);
		await assertProviderResponse({ status: 200, payload: { results: [] } }, NotFoundException);
		await assertProviderResponse(
			{
				status: 200,
				payload: {
					results: [
						{
							symbol: "OTHER123",
							regularMarketPrice: 10,
							currency: ASSET_CURRENCY,
						},
					],
				},
			},
			BadGatewayException,
		);
		await assertProviderResponse(
			{
				status: 200,
				payload: {
					results: [
						{
							symbol: ASSET_TICKER,
							regularMarketPrice: 10,
							currency: "USD",
						},
					],
				},
			},
			BadGatewayException,
		);
	} finally {
		restoreMarketDataEnv(env);
	}
});

test("stores safe raw payload from a successful optional provider refresh", async () => {
	const env = captureMarketDataEnv();
	const brapi = await createMockHttpServer((request, response) => {
		assert.equal(request.url, `/api/quote/${ASSET_TICKER}`);
		sendJson(response, 200, {
			results: [
				{
					symbol: ASSET_TICKER,
					regularMarketPrice: 222.22,
					regularMarketTime: TEST_CAPTURED_AT.toISOString(),
					currency: ASSET_CURRENCY,
				},
			],
		});
	});
	process.env[PROVIDER_ENV_NAME] = BRAPI_PROVIDER_ID;
	process.env[BRAPI_BASE_URL_ENV_NAME] = brapi.baseUrl;
	process.env[BRAPI_TIMEOUT_MS_ENV_NAME] = "1000";
	delete process.env[BRAPI_TOKEN_ENV_NAME];

	const repository = new FakeMarketDataRepository();
	const service = createService(repository);

	try {
		const snapshot = await service.refreshPriceSnapshotFromProvider(USER_ID, ASSET_ID);

		assert.equal(snapshot.price, "222.22");
		assert.deepEqual(repository.createdSnapshots[0]?.rawPayloadJson, {
			symbol: ASSET_TICKER,
			regularMarketPrice: 222.22,
			regularMarketTime: TEST_CAPTURED_AT.toISOString(),
			currency: ASSET_CURRENCY,
		});
	} finally {
		await brapi.close();
		restoreMarketDataEnv(env);
	}
});

async function assertProviderResponse(
	response: { status: number; payload: unknown },
	expectedError:
		| typeof BadGatewayException
		| typeof ConflictException
		| typeof NotFoundException
		| typeof ServiceUnavailableException,
): Promise<void> {
	const brapi = await createMockHttpServer((_request, serverResponse) => {
		sendJson(serverResponse, response.status, response.payload);
	});
	process.env[PROVIDER_ENV_NAME] = BRAPI_PROVIDER_ID;
	process.env[BRAPI_BASE_URL_ENV_NAME] = brapi.baseUrl;
	process.env[BRAPI_TIMEOUT_MS_ENV_NAME] = "1000";
	delete process.env[BRAPI_TOKEN_ENV_NAME];

	const repository = new FakeMarketDataRepository();
	const service = createService(repository);

	try {
		await assert.rejects(
			() => service.refreshPriceSnapshotFromProvider(USER_ID, ASSET_ID),
			expectedError,
		);
		assert.equal(repository.createdSnapshots.length, 0);
	} finally {
		await brapi.close();
	}
}
