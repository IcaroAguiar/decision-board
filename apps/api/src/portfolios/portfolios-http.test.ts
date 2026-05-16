import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { clearAuthRateLimits, jsonHeaders, signUpTestUser } from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";

interface PortfolioPayload {
	id: string;
	name: string;
	baseCurrency: string;
	createdAt: string;
	updatedAt: string;
}

function assertPortfolioPayload(payload: unknown): PortfolioPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.name, "string");
	assert.equal(typeof payload.baseCurrency, "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal(typeof payload.updatedAt, "string");
	assert.equal("userId" in payload, false);

	return payload as unknown as PortfolioPayload;
}

function assertPortfolioListPayload(payload: unknown): PortfolioPayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertPortfolioPayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

test("requires authentication and validates portfolio DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "validation");

	try {
		const anonymousList = await fetch(`${baseUrl}/portfolios`);
		assert.equal(anonymousList.status, 401);

		const anonymousCreate = await fetch(`${baseUrl}/portfolios`, {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ name: "No session" }),
		});
		assert.equal(anonymousCreate.status, 401);

		const emptyName = await fetch(`${baseUrl}/portfolios`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ name: "   " }),
		});
		assert.equal(emptyName.status, 400);

		const unknownField = await fetch(`${baseUrl}/portfolios`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({ name: "Main", userId: user.userId }),
		});
		assert.equal(unknownField.status, 400);

		const invalidId = await fetch(`${baseUrl}/portfolios/not-a-uuid`, {
			headers: {
				cookie: user.cookieHeader,
			},
		});
		assert.equal(invalidId.status, 400);

		const emptyPatch = await fetch(`${baseUrl}/portfolios/${randomUUID()}`, {
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

test("scopes portfolio CRUD to the authenticated user", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "user-a");
	const userB = await signUpTestUser(baseUrl, "user-b");

	try {
		const createA = await fetch(`${baseUrl}/portfolios`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({ name: "Long term income" }),
		});
		const portfolioA = assertPortfolioPayload(await readJson(createA));
		assert.equal(createA.status, 201);
		assert.equal(portfolioA.name, "Long term income");
		assert.equal(portfolioA.baseCurrency, "BRL");

		const createB = await fetch(`${baseUrl}/portfolios`, {
			method: "POST",
			headers: jsonHeaders(userB),
			body: JSON.stringify({ name: "Private growth", baseCurrency: "usd" }),
		});
		const portfolioB = assertPortfolioPayload(await readJson(createB));
		assert.equal(createB.status, 201);
		assert.equal(portfolioB.baseCurrency, "USD");

		const listA = await fetch(`${baseUrl}/portfolios`, {
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(listA.status, 200);
		assert.deepEqual(
			assertPortfolioListPayload(await readJson(listA)).map((portfolio) => portfolio.id),
			[portfolioA.id],
		);

		const getOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(getOwn.status, 200);
		assert.equal(assertPortfolioPayload(await readJson(getOwn)).id, portfolioA.id);

		const getOther = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			headers: {
				cookie: userB.cookieHeader,
			},
		});
		assert.equal(getOther.status, 404);

		const updateOther = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userB),
			body: JSON.stringify({ name: "Cross tenant edit" }),
		});
		assert.equal(updateOther.status, 404);

		const updateOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({ name: "Long term income updated", baseCurrency: "brl" }),
		});
		assert.equal(updateOwn.status, 200);
		const updatedPortfolio = assertPortfolioPayload(await readJson(updateOwn));
		assert.equal(updatedPortfolio.name, "Long term income updated");
		assert.equal(updatedPortfolio.baseCurrency, "BRL");

		await prisma.cashAccount.create({
			data: {
				userId: userA.userId,
				portfolioId: portfolioA.id,
				name: "Reserva",
				type: "CDB",
				balance: "100.00",
			},
		});

		const deleteNonEmpty = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			method: "DELETE",
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(deleteNonEmpty.status, 409);

		const deleteOther = await fetch(`${baseUrl}/portfolios/${portfolioB.id}`, {
			method: "DELETE",
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(deleteOther.status, 404);

		await prisma.cashAccount.deleteMany({
			where: {
				userId: userA.userId,
				portfolioId: portfolioA.id,
			},
		});

		const deleteOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			method: "DELETE",
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(deleteOwn.status, 204);
		assert.equal(await deleteOwn.text(), "");

		const getDeleted = await fetch(`${baseUrl}/portfolios/${portfolioA.id}`, {
			headers: {
				cookie: userA.cookieHeader,
			},
		});
		assert.equal(getDeleted.status, 404);
	} finally {
		await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
