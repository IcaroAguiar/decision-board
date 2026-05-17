import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { manualMarketDataProviderName } from "@decision-board/market-data";
import { contributionCycleStatuses, strategyIds } from "@decision-board/types";
import {
	clearAuthRateLimits,
	jsonHeaders,
	signUpTestUser,
	type TestUser,
} from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";

const smokeEmailPrefix = "test-api-smoke-";
const smokeTickerPrefix = "SMK";
const httpMethods = {
	post: "POST",
	patch: "PATCH",
} as const;

interface SmokeResourceIds {
	ticker?: string;
	userEmails: string[];
}

interface IdPayload {
	id: string;
}

async function main(): Promise<void> {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	const resources: SmokeResourceIds = {
		userEmails: [],
	};

	try {
		await prisma.user.deleteMany({ where: { email: { startsWith: smokeEmailPrefix } } });
		await clearAuthRateLimits(prisma);

		const user = await signUpSmokeUser(baseUrl, "primary", resources);
		const anonymousPortfolios = await fetch(`${baseUrl}/portfolios`);
		assert.equal(anonymousPortfolios.status, 401);

		const portfolio = await createPortfolio(baseUrl, user);
		await assertPortfolioListed(baseUrl, user, portfolio.id);

		const asset = await createAsset(baseUrl, user, resources);
		const priceSnapshot = await createManualPriceSnapshot(baseUrl, user, asset.id);
		assert.equal(priceSnapshot.provider, manualMarketDataProviderName);

		const position = await createPosition(baseUrl, user, portfolio.id, asset.id);
		assert.equal(position.totalValue, "1252.5");

		const cashAccount = await createCashAccount(baseUrl, user, portfolio.id);
		const contributionPlan = await createContributionPlan(
			baseUrl,
			user,
			portfolio.id,
			cashAccount.id,
		);
		const contributionCycle = await createAndConfirmContributionCycle(
			baseUrl,
			user,
			portfolio.id,
			contributionPlan.id,
		);
		assert.equal(contributionCycle.status, contributionCycleStatuses.confirmed);

		const secondUser = await signUpSmokeUser(baseUrl, "isolated", resources);
		const crossUserPortfolioRead = await fetch(`${baseUrl}/portfolios/${portfolio.id}`, {
			headers: jsonHeaders(secondUser),
		});
		assert.equal(crossUserPortfolioRead.status, 404);

		writeSmokeResult({
			status: "pass",
			journey: "api-authenticated-portfolio-smoke",
			port: new URL(baseUrl).port,
			assertions: [
				"auth-required",
				"portfolio-create-list",
				"asset-create",
				"manual-price-snapshot",
				"position-total-value",
				"cash-account",
				"contribution-plan",
				"contribution-cycle-confirm",
				"user-isolation",
			],
		});
	} finally {
		await cleanupSmokeData(prisma, resources);
		await app.close();
		await prisma.$disconnect();
	}
}

async function signUpSmokeUser(
	baseUrl: string,
	label: string,
	resources: SmokeResourceIds,
): Promise<TestUser> {
	const user = await signUpTestUser(baseUrl, `api-smoke-${label}`);
	resources.userEmails.push(user.email);
	return user;
}

async function createPortfolio(baseUrl: string, user: TestUser): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({ name: "Smoke portfolio", baseCurrency: "brl" }),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function assertPortfolioListed(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
): Promise<void> {
	const response = await fetch(`${baseUrl}/portfolios`, {
		headers: jsonHeaders(user),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 200, JSON.stringify(payload));
	assert.ok(Array.isArray(payload));
	assert.ok(payload.some((portfolio) => isRecord(portfolio) && portfolio.id === portfolioId));
}

async function createAsset(
	baseUrl: string,
	user: TestUser,
	resources: SmokeResourceIds,
): Promise<IdPayload> {
	const ticker =
		`${smokeTickerPrefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
	resources.ticker = ticker;
	const response = await fetch(`${baseUrl}/assets`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			ticker,
			name: "Smoke FII",
			assetType: "fii",
			riskCategory: "paper",
			segment: "receivables",
			currency: "brl",
			exchange: "B3",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createManualPriceSnapshot(
	baseUrl: string,
	user: TestUser,
	assetId: string,
): Promise<{ provider: string }> {
	const response = await fetch(`${baseUrl}/assets/${assetId}/price-snapshots`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			price: "100.25",
			currency: "brl",
			capturedAt: "2026-05-17T12:00:00.000Z",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	assert.ok(isRecord(payload));
	const provider = readStringField(payload, "provider");
	assert.equal("userId" in payload, false);
	return { provider };
}

async function createPosition(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	assetId: string,
): Promise<{ totalValue: string }> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/positions`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			assetId,
			quantity: "12.5",
			averagePrice: "90",
			manualCurrentPrice: "100.20",
			notes: "synthetic smoke position",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	assert.ok(isRecord(payload));
	const totalValue = readStringField(payload, "totalValue");
	assert.equal("userId" in payload, false);
	return { totalValue };
}

async function createCashAccount(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/cash-accounts`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			name: "Smoke reserve",
			type: "CDB",
			balance: "1500.50",
			liquidity: "D+0",
			benchmark: "CDI",
			benchmarkPercent: "100",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createContributionPlan(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	cashAccountId: string,
): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/contribution-plans`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			amount: "1000",
			frequency: "monthly",
			dayOfMonth: 10,
			startsAt: "2099-01-01",
			defaultStrategyId: strategyIds.balancedGrowth,
			cashAccountId,
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createAndConfirmContributionCycle(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	contributionPlanId: string,
): Promise<{ status: string }> {
	const createResponse = await fetch(`${baseUrl}/contribution-plans/${contributionPlanId}/cycles`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			cycleMonth: "2099-05",
		}),
	});
	const createPayload = await readJson(createResponse);
	assert.equal(createResponse.status, 201, JSON.stringify(createPayload));
	const cycle = assertIdPayload(createPayload);

	const listResponse = await fetch(`${baseUrl}/portfolios/${portfolioId}/contribution-cycles`, {
		headers: jsonHeaders(user),
	});
	const listPayload = await readJson(listResponse);
	assert.equal(listResponse.status, 200, JSON.stringify(listPayload));
	assert.ok(Array.isArray(listPayload));
	assert.ok(listPayload.some((candidate) => isRecord(candidate) && candidate.id === cycle.id));

	const confirmResponse = await fetch(`${baseUrl}/contribution-cycles/${cycle.id}`, {
		method: httpMethods.patch,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			status: contributionCycleStatuses.confirmed,
			confirmedAmount: "1200",
			strategyId: strategyIds.opportunistic,
			notes: "synthetic smoke confirmation",
		}),
	});
	const confirmPayload = await readJson(confirmResponse);
	assert.equal(confirmResponse.status, 200, JSON.stringify(confirmPayload));
	assert.ok(isRecord(confirmPayload));
	const status = readStringField(confirmPayload, "status");
	assert.equal("userId" in confirmPayload, false);
	return { status };
}

async function cleanupSmokeData(
	prisma: {
		user: {
			deleteMany(args: {
				where: { email: { in?: string[]; startsWith?: string } };
			}): Promise<unknown>;
		};
		asset: { deleteMany(args: { where: { ticker?: string } }): Promise<unknown> };
		rateLimit: {
			deleteMany(args: { where: { key: { contains: string } } }): Promise<unknown>;
		};
	},
	resources: SmokeResourceIds,
): Promise<void> {
	await prisma.user.deleteMany({
		where: resources.userEmails.length
			? { email: { in: resources.userEmails } }
			: { email: { startsWith: smokeEmailPrefix } },
	});
	if (resources.ticker) {
		await prisma.asset.deleteMany({ where: { ticker: resources.ticker } });
	}
	await clearAuthRateLimits(prisma);
}

function assertIdPayload(payload: unknown): IdPayload {
	assert.ok(isRecord(payload));
	const id = readStringField(payload, "id");
	assert.equal("userId" in payload, false);
	return { id };
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

function writeSmokeResult(result: {
	status: "pass";
	journey: string;
	port: string;
	assertions: string[];
}): void {
	process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : "Unknown smoke failure";
	process.stderr.write(`${JSON.stringify({ status: "fail", message })}\n`);
	process.exitCode = 1;
});
