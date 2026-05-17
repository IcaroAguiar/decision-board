import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { clearAuthRateLimits, jsonHeaders, signUpTestUser } from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";

interface AssetPayload {
	id: string;
	ticker: string;
	name: string;
	assetType: string;
	riskCategory: string;
	segment: string | null;
	currency: string;
	exchange: string | null;
	effectiveName: string;
	effectiveAssetType: string;
	effectiveSegment: string | null;
	effectiveRiskCategory: string;
	userOverride: {
		customName: string | null;
		customAssetType: string | null;
		customSegment: string | null;
		customRiskCategory: string | null;
		notes: string | null;
	} | null;
	createdAt: string;
	updatedAt: string;
}

function uniqueTicker(prefix: string): string {
	return `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
}

function assertAssetPayload(payload: unknown): AssetPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.ticker, "string");
	assert.equal(typeof payload.name, "string");
	assert.equal(typeof payload.assetType, "string");
	assert.equal(typeof payload.riskCategory, "string");
	assert.ok(payload.segment === null || typeof payload.segment === "string");
	assert.equal(typeof payload.currency, "string");
	assert.ok(payload.exchange === null || typeof payload.exchange === "string");
	assert.equal(typeof payload.effectiveName, "string");
	assert.equal(typeof payload.effectiveAssetType, "string");
	assert.ok(payload.effectiveSegment === null || typeof payload.effectiveSegment === "string");
	assert.equal(typeof payload.effectiveRiskCategory, "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal(typeof payload.updatedAt, "string");
	assert.equal("userId" in payload, false);

	if (payload.userOverride !== null) {
		assert.ok(isRecord(payload.userOverride));
		assert.equal("userId" in payload.userOverride, false);
	}

	return payload as unknown as AssetPayload;
}

function assertAssetListPayload(payload: unknown): AssetPayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertAssetPayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

test("requires authentication and validates asset DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "assets-validation");

	try {
		const anonymousList = await fetch(`${baseUrl}/assets`);
		assert.equal(anonymousList.status, 401);

		const unknownField = await fetch(`${baseUrl}/assets`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				ticker: "CYCR11",
				name: "Cyrela Credit",
				assetType: "fii",
				riskCategory: "paper",
				userId: user.userId,
			}),
		});
		assert.equal(unknownField.status, 400);

		const invalidClassification = await fetch(`${baseUrl}/assets`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				ticker: "CYCR11",
				name: "Cyrela Credit",
				assetType: "coin",
				riskCategory: "paper",
			}),
		});
		assert.equal(invalidClassification.status, 400);

		const invalidTicker = await fetch(`${baseUrl}/assets`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				ticker: "PETR4,VALE3",
				name: "Unsafe ticker",
				assetType: "fii",
				riskCategory: "paper",
			}),
		});
		assert.equal(invalidTicker.status, 400);

		const invalidSearch = await fetch(`${baseUrl}/assets?provider=brapi`, {
			headers: {
				cookie: user.cookieHeader,
			},
		});
		assert.equal(invalidSearch.status, 400);

		const invalidLimit = await fetch(`${baseUrl}/assets?limit=200`, {
			headers: {
				cookie: user.cookieHeader,
			},
		});
		assert.equal(invalidLimit.status, 400);

		const invalidId = await fetch(`${baseUrl}/assets/not-a-uuid`, {
			headers: {
				cookie: user.cookieHeader,
			},
		});
		assert.equal(invalidId.status, 400);

		const emptyOverride = await fetch(`${baseUrl}/assets/${randomUUID()}/override`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify({}),
		});
		assert.equal(emptyOverride.status, 400);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("searches global assets and keeps user overrides isolated", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "assets-user-a");
	const userB = await signUpTestUser(baseUrl, "assets-user-b");
	const ticker = uniqueTicker("DB");

	try {
		const create = await fetch(`${baseUrl}/assets`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				ticker: ticker.toLowerCase(),
				name: "Decision Board Recebiveis",
				assetType: "fii",
				riskCategory: "paper",
				segment: "recebiveis",
				currency: "brl",
			}),
		});
		const createdAsset = assertAssetPayload(await readJson(create));
		assert.equal(create.status, 201);
		assert.equal(createdAsset.ticker, ticker);
		assert.equal(createdAsset.name, ticker);
		assert.equal(createdAsset.assetType, "OTHER");
		assert.equal(createdAsset.riskCategory, "OTHER");
		assert.equal(createdAsset.segment, null);
		assert.equal(createdAsset.currency, "BRL");
		assert.equal(createdAsset.exchange, "B3");
		assert.equal(createdAsset.effectiveName, "Decision Board Recebiveis");
		assert.equal(createdAsset.effectiveAssetType, "FII");
		assert.equal(createdAsset.effectiveSegment, "recebiveis");
		assert.equal(createdAsset.effectiveRiskCategory, "PAPER");
		assert.deepEqual(createdAsset.userOverride, {
			customName: "Decision Board Recebiveis",
			customAssetType: "FII",
			customSegment: "recebiveis",
			customRiskCategory: "PAPER",
			notes: null,
		});

		const registerForUserB = await fetch(`${baseUrl}/assets`, {
			method: "POST",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				ticker,
				name: "User B stock view",
				assetType: "stock",
				riskCategory: "other",
			}),
		});
		const assetRegisteredForB = assertAssetPayload(await readJson(registerForUserB));
		assert.equal(registerForUserB.status, 201);
		assert.equal(assetRegisteredForB.id, createdAsset.id);
		assert.equal(assetRegisteredForB.effectiveName, "User B stock view");
		assert.equal(assetRegisteredForB.effectiveAssetType, "STOCK");

		const registerDifferentCurrency = await fetch(`${baseUrl}/assets`, {
			method: "POST",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				ticker,
				name: "Dollar view",
				assetType: "stock",
				riskCategory: "other",
				currency: "usd",
			}),
		});
		const usdAsset = assertAssetPayload(await readJson(registerDifferentCurrency));
		assert.equal(registerDifferentCurrency.status, 201);
		assert.notEqual(usdAsset.id, createdAsset.id);
		assert.equal(usdAsset.currency, "USD");

		const search = await fetch(
			`${baseUrl}/assets?ticker=${ticker.slice(0, 5).toLowerCase()}&limit=10`,
			{
				headers: {
					cookie: userA.cookieHeader,
				},
			},
		);
		assert.equal(search.status, 200);
		assert.ok(
			assertAssetListPayload(await readJson(search)).some((asset) => asset.id === createdAsset.id),
		);

		const overrideA = await fetch(`${baseUrl}/assets/${createdAsset.id}/override`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				customName: "Meu fundo de recebiveis",
				customAssetType: "fii",
				customSegment: "logistica",
				customRiskCategory: "brick",
				notes: "classificacao pessoal",
			}),
		});
		const assetForA = assertAssetPayload(await readJson(overrideA));
		assert.equal(overrideA.status, 200);
		assert.equal(assetForA.effectiveName, "Meu fundo de recebiveis");
		assert.equal(assetForA.effectiveAssetType, "FII");
		assert.equal(assetForA.effectiveSegment, "logistica");
		assert.equal(assetForA.effectiveRiskCategory, "BRICK");
		assert.deepEqual(assetForA.userOverride, {
			customName: "Meu fundo de recebiveis",
			customAssetType: "FII",
			customSegment: "logistica",
			customRiskCategory: "BRICK",
			notes: "classificacao pessoal",
		});

		const assetForBResponse = await fetch(`${baseUrl}/assets/${createdAsset.id}`, {
			headers: {
				cookie: userB.cookieHeader,
			},
		});
		const assetForB = assertAssetPayload(await readJson(assetForBResponse));
		assert.equal(assetForBResponse.status, 200);
		assert.equal(assetForB.effectiveName, "User B stock view");
		assert.equal(assetForB.effectiveAssetType, "STOCK");
		assert.equal(assetForB.effectiveSegment, null);
		assert.equal(assetForB.effectiveRiskCategory, "OTHER");

		const overrideB = await fetch(`${baseUrl}/assets/${createdAsset.id}/override`, {
			method: "PATCH",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				customAssetType: "etf",
				customRiskCategory: "hybrid",
			}),
		});
		const updatedAssetForB = assertAssetPayload(await readJson(overrideB));
		assert.equal(overrideB.status, 200);
		assert.equal(updatedAssetForB.effectiveAssetType, "ETF");
		assert.equal(updatedAssetForB.effectiveRiskCategory, "HYBRID");

		const assetForAResponse = await fetch(`${baseUrl}/assets/${createdAsset.id}`, {
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		const refreshedAssetForA = assertAssetPayload(await readJson(assetForAResponse));
		assert.equal(refreshedAssetForA.effectiveAssetType, "FII");
		assert.equal(refreshedAssetForA.effectiveRiskCategory, "BRICK");
	} finally {
		await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
		await prisma.asset.deleteMany({ where: { ticker } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
