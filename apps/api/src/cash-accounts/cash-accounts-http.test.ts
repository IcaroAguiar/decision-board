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

interface CashAccountPayload {
	id: string;
	portfolioId: string;
	name: string;
	type: string;
	balance: string;
	liquidity: string | null;
	benchmark: string | null;
	benchmarkPercent: string | null;
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

function assertPortfolioPayload(payload: unknown): PortfolioPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	return payload as unknown as PortfolioPayload;
}

function assertCashAccountPayload(payload: unknown): CashAccountPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.portfolioId, "string");
	assert.equal(typeof payload.name, "string");
	assert.equal(typeof payload.type, "string");
	assert.equal(typeof payload.balance, "string");
	assert.ok(payload.liquidity === null || typeof payload.liquidity === "string");
	assert.ok(payload.benchmark === null || typeof payload.benchmark === "string");
	assert.ok(payload.benchmarkPercent === null || typeof payload.benchmarkPercent === "string");
	assert.ok(payload.notes === null || typeof payload.notes === "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal(typeof payload.updatedAt, "string");
	assert.equal("userId" in payload, false);

	return payload as unknown as CashAccountPayload;
}

function assertCashAccountListPayload(payload: unknown): CashAccountPayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertCashAccountPayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

test("requires authentication and validates cash account DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "cash-validation");
	const portfolio = await createPortfolio(baseUrl, user, "Cash validation");

	try {
		const anonymousList = await fetch(`${baseUrl}/portfolios/${portfolio.id}/cash-accounts`);
		assert.equal(anonymousList.status, 401);

		const unknownField = await fetch(`${baseUrl}/portfolios/${portfolio.id}/cash-accounts`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				name: "Reserva",
				type: "CDB",
				balance: "100",
				userId: user.userId,
			}),
		});
		assert.equal(unknownField.status, 400);

		const negativeBalance = await fetch(`${baseUrl}/portfolios/${portfolio.id}/cash-accounts`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				name: "Reserva",
				type: "CDB",
				balance: "-1",
			}),
		});
		assert.equal(negativeBalance.status, 400);

		const oversizedBalance = await fetch(`${baseUrl}/portfolios/${portfolio.id}/cash-accounts`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				name: "Reserva",
				type: "CDB",
				balance: "1000000000000",
			}),
		});
		assert.equal(oversizedBalance.status, 400);

		const negativeBenchmark = await fetch(`${baseUrl}/portfolios/${portfolio.id}/cash-accounts`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				name: "Reserva",
				type: "CDB",
				balance: "100",
				benchmarkPercent: "-1",
			}),
		});
		assert.equal(negativeBenchmark.status, 400);

		const oversizedBenchmark = await fetch(`${baseUrl}/portfolios/${portfolio.id}/cash-accounts`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				name: "Reserva",
				type: "CDB",
				balance: "100",
				benchmarkPercent: "1000000",
			}),
		});
		assert.equal(oversizedBenchmark.status, 400);

		const invalidPortfolioId = await fetch(`${baseUrl}/portfolios/not-a-uuid/cash-accounts`, {
			headers: jsonHeaders(user),
		});
		assert.equal(invalidPortfolioId.status, 400);

		const emptyPatch = await fetch(`${baseUrl}/cash-accounts/${randomUUID()}`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify({}),
		});
		assert.equal(emptyPatch.status, 400);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("scopes cash accounts by user and keeps cash separate from positions", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "cash-user-a");
	const userB = await signUpTestUser(baseUrl, "cash-user-b");
	const portfolioA = await createPortfolio(baseUrl, userA, "Carteira A");
	const portfolioB = await createPortfolio(baseUrl, userB, "Carteira B");

	try {
		const create = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/cash-accounts`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				name: "Reserva diaria",
				type: "CDB",
				balance: "1000.50",
				liquidity: "D+0",
				benchmark: "CDI",
				benchmarkPercent: "100",
				notes: "caixa operacional",
			}),
		});
		const createPayload = await readJson(create);
		assert.equal(create.status, 201, JSON.stringify(createPayload));
		const createdCashAccount = assertCashAccountPayload(createPayload);
		assert.equal(createdCashAccount.portfolioId, portfolioA.id);
		assert.equal(createdCashAccount.name, "Reserva diaria");
		assert.equal(createdCashAccount.type, "CDB");
		assert.equal(createdCashAccount.balance, "1000.5");
		assert.equal(createdCashAccount.liquidity, "D+0");
		assert.equal(createdCashAccount.benchmark, "CDI");
		assert.equal(createdCashAccount.benchmarkPercent, "100");
		assert.equal(createdCashAccount.notes, "caixa operacional");

		const createInOtherPortfolio = await fetch(
			`${baseUrl}/portfolios/${portfolioB.id}/cash-accounts`,
			{
				method: "POST",
				headers: jsonHeaders(userA),
				body: JSON.stringify({
					name: "Cross tenant cash",
					type: "CDB",
					balance: "1",
				}),
			},
		);
		assert.equal(createInOtherPortfolio.status, 404);

		const listOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/cash-accounts`, {
			headers: jsonHeaders(userA),
		});
		assert.equal(listOwn.status, 200);
		assert.deepEqual(
			assertCashAccountListPayload(await readJson(listOwn)).map((account) => account.id),
			[createdCashAccount.id],
		);

		const positionsList = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/positions`, {
			headers: jsonHeaders(userA),
		});
		assert.equal(positionsList.status, 200);
		assert.deepEqual(await readJson(positionsList), []);

		const listOther = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/cash-accounts`, {
			headers: jsonHeaders(userB),
		});
		assert.equal(listOther.status, 404);

		const updateOther = await fetch(`${baseUrl}/cash-accounts/${createdCashAccount.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				balance: "1",
			}),
		});
		assert.equal(updateOther.status, 404);

		const updateOwn = await fetch(`${baseUrl}/cash-accounts/${createdCashAccount.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				balance: "1250.75",
				liquidity: "D+1",
				benchmarkPercent: "105.5",
			}),
		});
		const updatedCashAccount = assertCashAccountPayload(await readJson(updateOwn));
		assert.equal(updateOwn.status, 200);
		assert.equal(updatedCashAccount.balance, "1250.75");
		assert.equal(updatedCashAccount.liquidity, "D+1");
		assert.equal(updatedCashAccount.benchmarkPercent, "105.5");
	} finally {
		await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
