import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
	clearAuthRateLimits,
	jsonHeaders,
	signUpTestUser,
	type TestUser,
} from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";

interface PortfolioPayload {
	id: string;
}

interface AssetPayload {
	id: string;
}

interface PositionPayload {
	id: string;
	portfolioId: string;
	assetId: string;
	quantity: string;
	averagePrice: string | null;
	manualCurrentPrice: string | null;
	currentPrice: string | null;
	totalValue: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

async function createPortfolio(
	baseUrl: string,
	user: TestUser,
	name: string,
): Promise<PortfolioPayload> {
	const response = await fetch(`${baseUrl}/portfolios`, {
		method: "POST",
		headers: jsonHeaders(user),
		body: JSON.stringify({ name }),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));

	return assertPortfolioPayload(payload);
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
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));

	return assertAssetPayload(payload);
}

function assertPortfolioPayload(payload: unknown): PortfolioPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	return payload as unknown as PortfolioPayload;
}

function assertAssetPayload(payload: unknown): AssetPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	return payload as unknown as AssetPayload;
}

function assertPositionPayload(payload: unknown): PositionPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.portfolioId, "string");
	assert.equal(typeof payload.assetId, "string");
	assert.equal(typeof payload.quantity, "string");
	assert.ok(payload.averagePrice === null || typeof payload.averagePrice === "string");
	assert.ok(payload.manualCurrentPrice === null || typeof payload.manualCurrentPrice === "string");
	assert.ok(payload.currentPrice === null || typeof payload.currentPrice === "string");
	assert.ok(payload.totalValue === null || typeof payload.totalValue === "string");
	assert.ok(payload.notes === null || typeof payload.notes === "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal(typeof payload.updatedAt, "string");
	assert.equal("userId" in payload, false);

	return payload as unknown as PositionPayload;
}

function assertPositionListPayload(payload: unknown): PositionPayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertPositionPayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

test("requires authentication and validates position DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "positions-validation");
	const portfolio = await createPortfolio(baseUrl, user, "Validation");
	const asset = await createAsset(
		baseUrl,
		user,
		`PV${randomUUID().replaceAll("-", "").slice(0, 8)}`,
	);

	try {
		const anonymousList = await fetch(`${baseUrl}/portfolios/${portfolio.id}/positions`);
		assert.equal(anonymousList.status, 401);

		const unknownField = await fetch(`${baseUrl}/portfolios/${portfolio.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "1",
				userId: user.userId,
			}),
		});
		assert.equal(unknownField.status, 400);

		const zeroQuantity = await fetch(`${baseUrl}/portfolios/${portfolio.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "0",
			}),
		});
		assert.equal(zeroQuantity.status, 400);

		const negativePrice = await fetch(`${baseUrl}/portfolios/${portfolio.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "1",
				manualCurrentPrice: "-1",
			}),
		});
		assert.equal(negativePrice.status, 400);

		const oversizedQuantity = await fetch(`${baseUrl}/portfolios/${portfolio.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "1000000000000",
			}),
		});
		assert.equal(oversizedQuantity.status, 400);

		const oversizedManualPrice = await fetch(`${baseUrl}/portfolios/${portfolio.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "1",
				manualCurrentPrice: "1000000000000",
			}),
		});
		assert.equal(oversizedManualPrice.status, 400);

		const invalidPortfolioId = await fetch(`${baseUrl}/portfolios/not-a-uuid/positions`, {
			headers: {
				cookie: user.cookieHeader,
			},
		});
		assert.equal(invalidPortfolioId.status, 400);

		const emptyPatch = await fetch(`${baseUrl}/positions/${randomUUID()}`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify({}),
		});
		assert.equal(emptyPatch.status, 400);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await prisma.asset.deleteMany({ where: { id: asset.id } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("scopes positions by user and calculates value from manual price", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "positions-user-a");
	const userB = await signUpTestUser(baseUrl, "positions-user-b");
	const portfolioA = await createPortfolio(baseUrl, userA, "Carteira A");
	const portfolioB = await createPortfolio(baseUrl, userB, "Carteira B");
	const ticker = `PT${randomUUID().replaceAll("-", "").slice(0, 8)}`;
	const asset = await createAsset(baseUrl, userA, ticker);

	try {
		const create = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "10.5",
				averagePrice: "90",
				manualCurrentPrice: "100.25",
				notes: "entrada manual",
			}),
		});
		const createdPosition = assertPositionPayload(await readJson(create));
		assert.equal(create.status, 201);
		assert.equal(createdPosition.portfolioId, portfolioA.id);
		assert.equal(createdPosition.assetId, asset.id);
		assert.equal(createdPosition.quantity, "10.5");
		assert.equal(createdPosition.averagePrice, "90");
		assert.equal(createdPosition.manualCurrentPrice, "100.25");
		assert.equal(createdPosition.currentPrice, "100.25");
		assert.equal(createdPosition.totalValue, "1052.625");

		const createInOtherPortfolio = await fetch(`${baseUrl}/portfolios/${portfolioB.id}/positions`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				assetId: asset.id,
				quantity: "1",
				manualCurrentPrice: "1",
			}),
		});
		assert.equal(createInOtherPortfolio.status, 404);

		const listOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/positions`, {
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(listOwn.status, 200);
		assert.deepEqual(
			assertPositionListPayload(await readJson(listOwn)).map((position) => position.id),
			[createdPosition.id],
		);

		const listOther = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/positions`, {
			headers: {
				cookie: userB.cookieHeader,
			},
		});
		assert.equal(listOther.status, 404);

		const updateOther = await fetch(`${baseUrl}/positions/${createdPosition.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				quantity: "1",
			}),
		});
		assert.equal(updateOther.status, 404);

		const updateOwn = await fetch(`${baseUrl}/positions/${createdPosition.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				quantity: "2",
				manualCurrentPrice: "11.25",
			}),
		});
		const updatedPosition = assertPositionPayload(await readJson(updateOwn));
		assert.equal(updateOwn.status, 200);
		assert.equal(updatedPosition.quantity, "2");
		assert.equal(updatedPosition.currentPrice, "11.25");
		assert.equal(updatedPosition.totalValue, "22.5");
	} finally {
		await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
		await prisma.asset.deleteMany({ where: { id: asset.id } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
