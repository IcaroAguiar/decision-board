import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { manualMarketDataProviderName } from "@decision-board/market-data";
import {
	clearAuthRateLimits,
	jsonHeaders,
	signUpTestUser,
	type TestUser,
} from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";

const TEST_EMAIL_PREFIX = "test-market-data-";

interface AssetPayload {
	id: string;
	ticker: string;
	currency: string;
}

interface PriceSnapshotPayload {
	id: string;
	assetId: string;
	price: string;
	currency: string;
	provider: string;
	capturedAt: string;
	createdAt: string;
}

function uniqueTicker(prefix: string): string {
	return `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
}

async function createAsset(baseUrl: string, user: TestUser, ticker: string): Promise<AssetPayload> {
	const response = await fetch(`${baseUrl}/assets`, {
		method: "POST",
		headers: jsonHeaders(user),
		body: JSON.stringify({
			ticker,
			name: `${ticker} Asset`,
			assetType: "fii",
			riskCategory: "paper",
			currency: "brl",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(payload.ticker, ticker);
	assert.equal(payload.currency, "BRL");

	return {
		id: readStringField(payload, "id"),
		ticker: readStringField(payload, "ticker"),
		currency: readStringField(payload, "currency"),
	};
}

function assertPriceSnapshotPayload(payload: unknown): PriceSnapshotPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.assetId, "string");
	assert.equal(typeof payload.price, "string");
	assert.equal(typeof payload.currency, "string");
	assert.equal(typeof payload.provider, "string");
	assert.equal(typeof payload.capturedAt, "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal("userId" in payload, false);
	assert.equal("rawPayloadJson" in payload, false);

	return {
		id: readStringField(payload, "id"),
		assetId: readStringField(payload, "assetId"),
		price: readStringField(payload, "price"),
		currency: readStringField(payload, "currency"),
		provider: readStringField(payload, "provider"),
		capturedAt: readStringField(payload, "capturedAt"),
		createdAt: readStringField(payload, "createdAt"),
	};
}

function assertPriceSnapshotListPayload(payload: unknown): PriceSnapshotPayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertPriceSnapshotPayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

function readStringField(payload: Record<string, unknown>, field: string): string {
	const value = payload[field];
	if (typeof value !== "string") {
		assert.fail(`${field} must be a string`);
	}

	return value;
}

test("requires authentication and validates manual price snapshot DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "market-data-validation");
	const ticker = uniqueTicker("MDV");
	const asset = await createAsset(baseUrl, user, ticker);

	try {
		const anonymousCreate = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ price: "100.25" }),
		});
		assert.equal(anonymousCreate.status, 401);

		const unknownField = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				price: "100.25",
				userId: user.userId,
			}),
		});
		assert.equal(unknownField.status, 400);

		const invalidPrice = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ price: "0" }),
		});
		assert.equal(invalidPrice.status, 400);

		const invalidCurrency = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ price: "100.25", currency: "BRL1" }),
		});
		assert.equal(invalidCurrency.status, 400);

		const mismatchedCurrency = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ price: "100.25", currency: "USD" }),
		});
		assert.equal(mismatchedCurrency.status, 400);

		const invalidTimestamp = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ price: "100.25", capturedAt: "2026-05-17" }),
		});
		assert.equal(invalidTimestamp.status, 400);

		const invalidAssetId = await fetch(`${baseUrl}/assets/not-a-uuid/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ price: "100.25" }),
		});
		assert.equal(invalidAssetId.status, 400);

		const missingAsset = await fetch(`${baseUrl}/assets/${randomUUID()}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ price: "100.25" }),
		});
		assert.equal(missingAsset.status, 404);

		const invalidLimit = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots?limit=200`, {
			headers: jsonHeaders(user),
		});
		assert.equal(invalidLimit.status, 400);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await prisma.asset.deleteMany({ where: { ticker } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("saves manual price snapshots and keeps user histories isolated", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "market-data-user-a");
	const userB = await signUpTestUser(baseUrl, "market-data-user-b");
	const ticker = uniqueTicker("MDI");
	const asset = await createAsset(baseUrl, userA, ticker);

	try {
		const createForA = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				price: "100.25",
				capturedAt: "2026-05-17T12:00:00.000Z",
			}),
		});
		const snapshotForA = assertPriceSnapshotPayload(await readJson(createForA));
		assert.equal(createForA.status, 201);
		assert.equal(snapshotForA.assetId, asset.id);
		assert.equal(snapshotForA.price, "100.25");
		assert.equal(snapshotForA.currency, "BRL");
		assert.equal(snapshotForA.provider, manualMarketDataProviderName);
		assert.equal(snapshotForA.capturedAt, "2026-05-17T12:00:00.000Z");

		const listForA = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			headers: jsonHeaders(userA),
		});
		assert.deepEqual(
			assertPriceSnapshotListPayload(await readJson(listForA)).map((snapshot) => snapshot.id),
			[snapshotForA.id],
		);

		const emptyListForB = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			headers: jsonHeaders(userB),
		});
		assert.deepEqual(assertPriceSnapshotListPayload(await readJson(emptyListForB)), []);

		const createForB = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			method: "POST",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				price: "101.00",
				capturedAt: "2026-05-18T12:00:00.000Z",
			}),
		});
		const snapshotForB = assertPriceSnapshotPayload(await readJson(createForB));
		assert.equal(createForB.status, 201);
		assert.equal(snapshotForB.price, "101");

		const refreshedListForA = await fetch(`${baseUrl}/assets/${asset.id}/price-snapshots`, {
			headers: jsonHeaders(userA),
		});
		assert.deepEqual(
			assertPriceSnapshotListPayload(await readJson(refreshedListForA)).map(
				(snapshot) => snapshot.id,
			),
			[snapshotForA.id],
		);
	} finally {
		await prisma.user.deleteMany({
			where: {
				email: {
					in: [userA.email, userB.email],
				},
			},
		});
		await prisma.asset.deleteMany({ where: { ticker } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
