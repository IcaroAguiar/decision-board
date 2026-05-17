import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { strategyIds } from "@decision-board/types";
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
}

interface ContributionPlanPayload {
	id: string;
	portfolioId: string;
	amount: string;
	frequency: "monthly";
	dayOfMonth: number;
	startsAt: string;
	endsAt: string | null;
	isActive: boolean;
	defaultStrategyId: string;
	cashAccountId: string | null;
	nextCycleDate: string | null;
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

	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");

	return payload as unknown as PortfolioPayload;
}

async function createCashAccount(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	name: string,
): Promise<CashAccountPayload> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/cash-accounts`, {
		method: "POST",
		headers: jsonHeaders(user),
		body: JSON.stringify({
			name,
			type: "CDB",
			balance: "1000",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));

	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");

	return payload as unknown as CashAccountPayload;
}

function assertContributionPlanPayload(payload: unknown): ContributionPlanPayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.portfolioId, "string");
	assert.equal(typeof payload.amount, "string");
	assert.equal(payload.frequency, "monthly");
	assert.equal(typeof payload.dayOfMonth, "number");
	assert.equal(typeof payload.startsAt, "string");
	assert.ok(payload.endsAt === null || typeof payload.endsAt === "string");
	assert.equal(typeof payload.isActive, "boolean");
	assert.equal(typeof payload.defaultStrategyId, "string");
	assert.ok(payload.cashAccountId === null || typeof payload.cashAccountId === "string");
	assert.ok(payload.nextCycleDate === null || typeof payload.nextCycleDate === "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal(typeof payload.updatedAt, "string");
	assert.equal("userId" in payload, false);

	return payload as unknown as ContributionPlanPayload;
}

function assertContributionPlanListPayload(payload: unknown): ContributionPlanPayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertContributionPlanPayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

test("requires authentication and validates contribution plan DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "contribution-plan-validation");
	const portfolio = await createPortfolio(baseUrl, user, "Contribution validation");

	try {
		const anonymousList = await fetch(`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`);
		assert.equal(anonymousList.status, 401);

		const validBase = {
			amount: "1000",
			frequency: "monthly",
			dayOfMonth: 10,
			startsAt: "2099-01-01",
			defaultStrategyId: strategyIds.balancedGrowth,
		};

		const unknownField = await fetch(`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				...validBase,
				userId: user.userId,
			}),
		});
		assert.equal(unknownField.status, 400);

		const zeroAmount = await fetch(`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				...validBase,
				amount: "0",
			}),
		});
		assert.equal(zeroAmount.status, 400);

		const invalidDay = await fetch(`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				...validBase,
				dayOfMonth: 32,
			}),
		});
		assert.equal(invalidDay.status, 400);

		const invalidDate = await fetch(`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				...validBase,
				startsAt: "2099-02-31",
			}),
		});
		assert.equal(invalidDate.status, 400);

		const invalidRange = await fetch(`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				...validBase,
				endsAt: "2098-12-31",
			}),
		});
		assert.equal(invalidRange.status, 400);

		const unknownStrategy = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`,
			{
				method: "POST",
				headers: jsonHeaders(user),
				body: JSON.stringify({
					...validBase,
					defaultStrategyId: "unknown",
				}),
			},
		);
		assert.equal(unknownStrategy.status, 400);

		const invalidCashAccountId = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/contribution-plans`,
			{
				method: "POST",
				headers: jsonHeaders(user),
				body: JSON.stringify({
					...validBase,
					cashAccountId: "not-a-uuid",
				}),
			},
		);
		assert.equal(invalidCashAccountId.status, 400);

		const invalidPortfolioId = await fetch(`${baseUrl}/portfolios/not-a-uuid/contribution-plans`, {
			headers: jsonHeaders(user),
		});
		assert.equal(invalidPortfolioId.status, 400);

		const emptyPatch = await fetch(`${baseUrl}/contribution-plans/${randomUUID()}`, {
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

test("scopes contribution plans by user and lists active plans with next cycle", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "contribution-plan-user-a");
	const userB = await signUpTestUser(baseUrl, "contribution-plan-user-b");
	const portfolioA = await createPortfolio(baseUrl, userA, "Carteira A");
	const portfolioB = await createPortfolio(baseUrl, userB, "Carteira B");
	const cashAccountA = await createCashAccount(baseUrl, userA, portfolioA.id, "Reserva A");
	const cashAccountB = await createCashAccount(baseUrl, userB, portfolioB.id, "Reserva B");

	try {
		const create = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/contribution-plans`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				amount: "1000",
				frequency: "monthly",
				dayOfMonth: 15,
				startsAt: "2099-01-01",
				endsAt: "2099-12-31",
				defaultStrategyId: strategyIds.balancedGrowth,
				cashAccountId: cashAccountA.id,
			}),
		});
		const createPayload = await readJson(create);
		assert.equal(create.status, 201, JSON.stringify(createPayload));
		const createdPlan = assertContributionPlanPayload(createPayload);
		assert.equal(createdPlan.portfolioId, portfolioA.id);
		assert.equal(createdPlan.amount, "1000");
		assert.equal(createdPlan.dayOfMonth, 15);
		assert.equal(createdPlan.startsAt, "2099-01-01");
		assert.equal(createdPlan.endsAt, "2099-12-31");
		assert.equal(createdPlan.isActive, true);
		assert.equal(createdPlan.defaultStrategyId, strategyIds.balancedGrowth);
		assert.equal(createdPlan.cashAccountId, cashAccountA.id);
		assert.equal(createdPlan.nextCycleDate, "2099-01-15");

		const createInOtherPortfolio = await fetch(
			`${baseUrl}/portfolios/${portfolioB.id}/contribution-plans`,
			{
				method: "POST",
				headers: jsonHeaders(userA),
				body: JSON.stringify({
					amount: "1000",
					frequency: "monthly",
					dayOfMonth: 15,
					startsAt: "2099-01-01",
					defaultStrategyId: strategyIds.balancedGrowth,
				}),
			},
		);
		assert.equal(createInOtherPortfolio.status, 404);

		const createWithOtherCashAccount = await fetch(
			`${baseUrl}/portfolios/${portfolioA.id}/contribution-plans`,
			{
				method: "POST",
				headers: jsonHeaders(userA),
				body: JSON.stringify({
					amount: "1000",
					frequency: "monthly",
					dayOfMonth: 15,
					startsAt: "2099-01-01",
					defaultStrategyId: strategyIds.balancedGrowth,
					cashAccountId: cashAccountB.id,
				}),
			},
		);
		assert.equal(createWithOtherCashAccount.status, 404);

		const listOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/contribution-plans`, {
			headers: jsonHeaders(userA),
		});
		assert.equal(listOwn.status, 200);
		assert.deepEqual(
			assertContributionPlanListPayload(await readJson(listOwn)).map((plan) => plan.id),
			[createdPlan.id],
		);

		const listOther = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/contribution-plans`, {
			headers: jsonHeaders(userB),
		});
		assert.equal(listOther.status, 404);

		const updateOther = await fetch(`${baseUrl}/contribution-plans/${createdPlan.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				isActive: false,
			}),
		});
		assert.equal(updateOther.status, 404);

		const deactivate = await fetch(`${baseUrl}/contribution-plans/${createdPlan.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				isActive: false,
			}),
		});
		const deactivatedPlan = assertContributionPlanPayload(await readJson(deactivate));
		assert.equal(deactivate.status, 200);
		assert.equal(deactivatedPlan.isActive, false);
		assert.equal(deactivatedPlan.nextCycleDate, null);

		const listActiveAfterDeactivate = await fetch(
			`${baseUrl}/portfolios/${portfolioA.id}/contribution-plans`,
			{
				headers: jsonHeaders(userA),
			},
		);
		assert.equal(listActiveAfterDeactivate.status, 200);
		assert.deepEqual(await readJson(listActiveAfterDeactivate), []);

		const reactivate = await fetch(`${baseUrl}/contribution-plans/${createdPlan.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				isActive: true,
				amount: "1200.25",
				dayOfMonth: 31,
				startsAt: "2099-02-01",
				endsAt: null,
				cashAccountId: null,
				defaultStrategyId: strategyIds.defensive,
			}),
		});
		const reactivatedPlan = assertContributionPlanPayload(await readJson(reactivate));
		assert.equal(reactivate.status, 200);
		assert.equal(reactivatedPlan.amount, "1200.25");
		assert.equal(reactivatedPlan.dayOfMonth, 31);
		assert.equal(reactivatedPlan.startsAt, "2099-02-01");
		assert.equal(reactivatedPlan.endsAt, null);
		assert.equal(reactivatedPlan.cashAccountId, null);
		assert.equal(reactivatedPlan.defaultStrategyId, strategyIds.defensive);
		assert.equal(reactivatedPlan.nextCycleDate, "2099-02-28");
	} finally {
		await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
