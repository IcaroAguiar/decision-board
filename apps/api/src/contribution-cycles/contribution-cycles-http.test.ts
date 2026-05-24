import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { contributionCycleStatuses, strategyIds } from "@decision-board/types";
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

interface ContributionPlanPayload {
	id: string;
}

interface ContributionCyclePayload {
	id: string;
	portfolioId: string;
	contributionPlanId: string;
	cycleMonth: string;
	plannedAmount: string;
	confirmedAmount: string | null;
	status: string;
	strategyId: string;
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

	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");

	return payload as unknown as PortfolioPayload;
}

async function createContributionPlan(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	amount = "1000",
): Promise<ContributionPlanPayload> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/contribution-plans`, {
		method: "POST",
		headers: jsonHeaders(user),
		body: JSON.stringify({
			amount,
			frequency: "monthly",
			dayOfMonth: 10,
			startsAt: "2099-01-01",
			defaultStrategyId: strategyIds.balancedGrowth,
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));

	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");

	return payload as unknown as ContributionPlanPayload;
}

function assertContributionCyclePayload(payload: unknown): ContributionCyclePayload {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");
	assert.equal(typeof payload.portfolioId, "string");
	assert.equal(typeof payload.contributionPlanId, "string");
	assert.equal(typeof payload.cycleMonth, "string");
	assert.equal(typeof payload.plannedAmount, "string");
	assert.ok(payload.confirmedAmount === null || typeof payload.confirmedAmount === "string");
	assert.equal(typeof payload.status, "string");
	assert.equal(typeof payload.strategyId, "string");
	assert.ok(payload.notes === null || typeof payload.notes === "string");
	assert.equal(typeof payload.createdAt, "string");
	assert.equal(typeof payload.updatedAt, "string");
	assert.equal("userId" in payload, false);

	return payload as unknown as ContributionCyclePayload;
}

function assertContributionCycleListPayload(payload: unknown): ContributionCyclePayload[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertContributionCyclePayload);
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

test("requires authentication and validates contribution cycle DTOs", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "contribution-cycle-validation");
	const portfolio = await createPortfolio(baseUrl, user, "Cycle validation");
	const contributionPlan = await createContributionPlan(baseUrl, user, portfolio.id);

	try {
		const anonymousCreate = await fetch(
			`${baseUrl}/contribution-plans/${contributionPlan.id}/cycles`,
			{
				method: "POST",
				body: JSON.stringify({ cycleMonth: "2099-05" }),
			},
		);
		assert.equal(anonymousCreate.status, 401);

		const validBase = {
			cycleMonth: "2099-05",
		};

		const unknownField = await fetch(
			`${baseUrl}/contribution-plans/${contributionPlan.id}/cycles`,
			{
				method: "POST",
				headers: jsonHeaders(user),
				body: JSON.stringify({
					...validBase,
					userId: user.userId,
				}),
			},
		);
		assert.equal(unknownField.status, 400);

		const invalidMonth = await fetch(
			`${baseUrl}/contribution-plans/${contributionPlan.id}/cycles`,
			{
				method: "POST",
				headers: jsonHeaders(user),
				body: JSON.stringify({
					cycleMonth: "2099-13",
				}),
			},
		);
		assert.equal(invalidMonth.status, 400);

		const unknownStrategy = await fetch(
			`${baseUrl}/contribution-plans/${contributionPlan.id}/cycles`,
			{
				method: "POST",
				headers: jsonHeaders(user),
				body: JSON.stringify({
					...validBase,
					strategyId: "unknown",
				}),
			},
		);
		assert.equal(unknownStrategy.status, 400);

		const invalidPlanId = await fetch(`${baseUrl}/contribution-plans/not-a-uuid/cycles`, {
			method: "POST",
			headers: jsonHeaders(user),
			body: JSON.stringify(validBase),
		});
		assert.equal(invalidPlanId.status, 400);

		const emptyPatch = await fetch(`${baseUrl}/contribution-cycles/${randomUUID()}`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify({}),
		});
		assert.equal(emptyPatch.status, 400);

		const invalidStatus = await fetch(`${baseUrl}/contribution-cycles/${randomUUID()}`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				status: "unknown",
			}),
		});
		assert.equal(invalidStatus.status, 400);

		const zeroConfirmedAmount = await fetch(`${baseUrl}/contribution-cycles/${randomUUID()}`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify({
				confirmedAmount: "0",
			}),
		});
		assert.equal(zeroConfirmedAmount.status, 400);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("scopes contribution cycles by user and confirms a different amount", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "contribution-cycle-user-a");
	const userB = await signUpTestUser(baseUrl, "contribution-cycle-user-b");
	const portfolioA = await createPortfolio(baseUrl, userA, "Cycles A");
	const portfolioB = await createPortfolio(baseUrl, userB, "Cycles B");
	const planA = await createContributionPlan(baseUrl, userA, portfolioA.id, "1000");
	const planB = await createContributionPlan(baseUrl, userB, portfolioB.id, "900");

	try {
		const create = await fetch(`${baseUrl}/contribution-plans/${planA.id}/cycles`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				cycleMonth: "2099-05",
				strategyId: strategyIds.defensive,
			}),
		});
		const createPayload = await readJson(create);
		assert.equal(create.status, 201, JSON.stringify(createPayload));
		const createdCycle = assertContributionCyclePayload(createPayload);
		assert.equal(createdCycle.portfolioId, portfolioA.id);
		assert.equal(createdCycle.contributionPlanId, planA.id);
		assert.equal(createdCycle.cycleMonth, "2099-05");
		assert.equal(createdCycle.plannedAmount, "1000");
		assert.equal(createdCycle.confirmedAmount, null);
		assert.equal(createdCycle.status, contributionCycleStatuses.pending);
		assert.equal(createdCycle.strategyId, strategyIds.defensive);

		const duplicate = await fetch(`${baseUrl}/contribution-plans/${planA.id}/cycles`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				cycleMonth: "2099-05",
			}),
		});
		assert.equal(duplicate.status, 409);

		const createFromOtherPlan = await fetch(`${baseUrl}/contribution-plans/${planB.id}/cycles`, {
			method: "POST",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				cycleMonth: "2099-05",
			}),
		});
		assert.equal(createFromOtherPlan.status, 404);

		const listOwn = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/contribution-cycles`, {
			headers: jsonHeaders(userA),
		});
		assert.equal(listOwn.status, 200);
		assert.deepEqual(
			assertContributionCycleListPayload(await readJson(listOwn)).map((cycle) => cycle.id),
			[createdCycle.id],
		);

		const listOther = await fetch(`${baseUrl}/portfolios/${portfolioA.id}/contribution-cycles`, {
			headers: jsonHeaders(userB),
		});
		assert.equal(listOther.status, 404);

		const updateOther = await fetch(`${baseUrl}/contribution-cycles/${createdCycle.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userB),
			body: JSON.stringify({
				status: contributionCycleStatuses.confirmed,
				confirmedAmount: "1200",
			}),
		});
		assert.equal(updateOther.status, 404);

		const confirmWithoutAmount = await fetch(`${baseUrl}/contribution-cycles/${createdCycle.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				status: contributionCycleStatuses.confirmed,
			}),
		});
		assert.equal(confirmWithoutAmount.status, 400);

		const confirm = await fetch(`${baseUrl}/contribution-cycles/${createdCycle.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				status: contributionCycleStatuses.confirmed,
				confirmedAmount: "1200",
				strategyId: strategyIds.opportunistic,
				notes: "Aporte maior no mes",
			}),
		});
		const confirmedCycle = assertContributionCyclePayload(await readJson(confirm));
		assert.equal(confirm.status, 200);
		assert.equal(confirmedCycle.status, contributionCycleStatuses.confirmed);
		assert.equal(confirmedCycle.plannedAmount, "1000");
		assert.equal(confirmedCycle.confirmedAmount, "1200");
		assert.equal(confirmedCycle.strategyId, strategyIds.opportunistic);
		assert.equal(confirmedCycle.notes, "Aporte maior no mes");

		const markReported = await fetch(`${baseUrl}/contribution-cycles/${createdCycle.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				status: contributionCycleStatuses.reported,
			}),
		});
		const reportedCycle = assertContributionCyclePayload(await readJson(markReported));
		assert.equal(markReported.status, 200);
		assert.equal(reportedCycle.status, contributionCycleStatuses.reported);

		const reopenReported = await fetch(`${baseUrl}/contribution-cycles/${createdCycle.id}`, {
			method: "PATCH",
			headers: jsonHeaders(userA),
			body: JSON.stringify({
				status: contributionCycleStatuses.confirmed,
				confirmedAmount: "1300",
			}),
		});
		assert.equal(reopenReported.status, 409);
	} finally {
		await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
