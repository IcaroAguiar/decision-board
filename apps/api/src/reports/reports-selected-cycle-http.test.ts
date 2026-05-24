import assert from "node:assert/strict";
import test from "node:test";
import { contributionCycleStatuses, strategyIds } from "@decision-board/types";
import {
	clearAuthRateLimits,
	jsonHeaders,
	signUpTestUser,
	type TestUser,
} from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";
import { createSavedReportResultStatuses, ReportsRepository } from "./reports.repository.js";

const TEST_EMAIL_PREFIX = "test-reports-selected-cycle-";

const httpMethods = {
	post: "POST",
	patch: "PATCH",
} as const;

interface IdPayload {
	id: string;
}

interface TestResources {
	userEmails: string[];
}

interface SavedReportMetadata {
	id: string;
	strategyId: string | null;
}

interface ContributionCycleListItem {
	id: string;
	status: string;
}

test("binds saved report content to the selected contribution cycle", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	const resources: TestResources = {
		userEmails: [],
	};

	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);

	try {
		const owner = await signUpReportUser(baseUrl, "owner", resources);
		const portfolio = await createPortfolio(baseUrl, owner);
		const cashAccount = await createCashAccount(baseUrl, owner, portfolio.id);
		const contributionPlan = await createContributionPlan(
			baseUrl,
			owner,
			portfolio.id,
			cashAccount.id,
		);
		const olderCycle = await createAndConfirmContributionCycle(
			baseUrl,
			owner,
			contributionPlan.id,
			{
				cycleMonth: "2099-05",
				strategyId: strategyIds.defensive,
			},
		);
		const newerCycle = await createAndConfirmContributionCycle(
			baseUrl,
			owner,
			contributionPlan.id,
			{
				cycleMonth: "2099-06",
				strategyId: strategyIds.opportunistic,
			},
		);

		const saveOlderResponse = await fetch(`${baseUrl}/portfolios/${portfolio.id}/reports`, {
			method: httpMethods.post,
			headers: jsonHeaders(owner),
			body: JSON.stringify({
				contributionCycleId: olderCycle.id,
			}),
		});
		const savedReport = assertSavedReportMetadata(await readJson(saveOlderResponse));
		assert.equal(saveOlderResponse.status, 201);
		assert.equal(savedReport.strategyId, strategyIds.defensive);

		const savedJsonResponse = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${savedReport.id}.json`,
			{
				headers: jsonHeaders(owner),
			},
		);
		const savedJson = await readJson(savedJsonResponse);
		assert.equal(savedJsonResponse.status, 200, JSON.stringify(savedJson));
		assert.ok(isRecord(savedJson));
		assert.ok(isRecord(savedJson.strategy));
		assert.equal(savedJson.strategy.id, strategyIds.defensive);
		assert.ok(isRecord(savedJson.contribution));
		assert.ok(Array.isArray(savedJson.contribution.latestCycles));
		assert.ok(isRecord(savedJson.contribution.latestCycles[0]));
		assert.equal(savedJson.contribution.latestCycles[0].cycleMonth, "2099-05");
		assert.equal(savedJson.contribution.latestCycles[0].strategyId, strategyIds.defensive);

		const cyclesAfterReport = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/contribution-cycles`,
			{
				headers: jsonHeaders(owner),
			},
		);
		const cyclesAfterReportPayload = assertContributionCycleListPayload(
			await readJson(cyclesAfterReport),
		);
		assert.equal(cyclesAfterReport.status, 200, JSON.stringify(cyclesAfterReportPayload));
		assert.equal(
			cyclesAfterReportPayload.find((cycle) => cycle.id === olderCycle.id)?.status,
			contributionCycleStatuses.reported,
		);
		assert.equal(
			cyclesAfterReportPayload.find((cycle) => cycle.id === newerCycle.id)?.status,
			contributionCycleStatuses.confirmed,
		);
	} finally {
		await cleanupReportData(prisma, resources);
		await app.close();
		await prisma.$disconnect();
	}
});

test("rejects saving a report when the selected cycle changed after snapshot", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	const resources: TestResources = {
		userEmails: [],
	};

	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);

	try {
		const owner = await signUpReportUser(baseUrl, "stale-snapshot", resources);
		const portfolio = await createPortfolio(baseUrl, owner);
		const cashAccount = await createCashAccount(baseUrl, owner, portfolio.id);
		const contributionPlan = await createContributionPlan(
			baseUrl,
			owner,
			portfolio.id,
			cashAccount.id,
		);
		const cycle = await createAndConfirmContributionCycle(baseUrl, owner, contributionPlan.id, {
			cycleMonth: "2099-07",
			strategyId: strategyIds.defensive,
		});
		const snapshot = await prisma.contributionCycle.findUniqueOrThrow({
			where: {
				id: cycle.id,
			},
			select: {
				updatedAt: true,
			},
		});

		const mutateCycle = await fetch(`${baseUrl}/contribution-cycles/${cycle.id}`, {
			method: httpMethods.patch,
			headers: jsonHeaders(owner),
			body: JSON.stringify({
				notes: "changed while report was being generated",
			}),
		});
		const mutateCyclePayload = await readJson(mutateCycle);
		assert.equal(mutateCycle.status, 200, JSON.stringify(mutateCyclePayload));

		const repository = new ReportsRepository();
		const staleSave = await repository.createSavedReport(owner.userId, portfolio.id, {
			contributionCycleId: cycle.id,
			contributionCycleUpdatedAt: snapshot.updatedAt,
			schemaVersion: "1.0",
			generatedAt: new Date("2099-07-15T12:00:00.000Z"),
			strategyId: strategyIds.defensive,
			alertCount: 0,
			jsonReport: {
				strategy: {
					id: strategyIds.defensive,
				},
			},
			markdownReport: "# stale report",
		});

		assert.equal(staleSave.status, createSavedReportResultStatuses.cycleChanged);
		assert.equal(
			await prisma.report.count({
				where: {
					userId: owner.userId,
					portfolioId: portfolio.id,
				},
			}),
			0,
		);

		const cycleAfterRejectedSave = await prisma.contributionCycle.findUniqueOrThrow({
			where: {
				id: cycle.id,
			},
			select: {
				status: true,
			},
		});
		assert.equal(cycleAfterRejectedSave.status, "CONFIRMED");
	} finally {
		await cleanupReportData(prisma, resources);
		await app.close();
		await prisma.$disconnect();
	}
});

async function signUpReportUser(
	baseUrl: string,
	label: string,
	resources: TestResources,
): Promise<TestUser> {
	const user = await signUpTestUser(baseUrl, `reports-selected-cycle-${label}`);
	resources.userEmails.push(user.email);
	return user;
}

async function createPortfolio(baseUrl: string, user: TestUser): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			name: "Selected cycle report portfolio",
			baseCurrency: "brl",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
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
			name: "Selected cycle reserve",
			type: "CDB",
			balance: "1500.50",
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
	contributionPlanId: string,
	options: {
		cycleMonth: string;
		strategyId: string;
	},
): Promise<IdPayload> {
	const createResponse = await fetch(`${baseUrl}/contribution-plans/${contributionPlanId}/cycles`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			cycleMonth: options.cycleMonth,
		}),
	});
	const cycle = assertIdPayload(await readJson(createResponse));
	assert.equal(createResponse.status, 201);

	const confirmResponse = await fetch(`${baseUrl}/contribution-cycles/${cycle.id}`, {
		method: httpMethods.patch,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			status: contributionCycleStatuses.confirmed,
			confirmedAmount: "1200",
			strategyId: options.strategyId,
		}),
	});
	const confirmPayload = await readJson(confirmResponse);
	assert.equal(confirmResponse.status, 200, JSON.stringify(confirmPayload));
	return cycle;
}

async function cleanupReportData(
	prisma: {
		user: {
			deleteMany(args: {
				where: { email: { in?: string[]; startsWith?: string } };
			}): Promise<unknown>;
		};
	},
	resources: TestResources,
): Promise<void> {
	await prisma.user.deleteMany({
		where: resources.userEmails.length
			? { email: { in: resources.userEmails } }
			: { email: { startsWith: TEST_EMAIL_PREFIX } },
	});
}

function assertSavedReportMetadata(payload: unknown): SavedReportMetadata {
	assert.ok(isRecord(payload));
	return {
		id: readStringField(payload, "id"),
		strategyId: readNullableStringField(payload, "strategyId"),
	};
}

function assertContributionCycleListPayload(payload: unknown): ContributionCycleListItem[] {
	assert.ok(Array.isArray(payload));
	return payload.map((cycle) => {
		assert.ok(isRecord(cycle));
		return {
			id: readStringField(cycle, "id"),
			status: readStringField(cycle, "status"),
		};
	});
}

function assertIdPayload(payload: unknown): IdPayload {
	assert.ok(isRecord(payload));
	return {
		id: readStringField(payload, "id"),
	};
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

function readNullableStringField(payload: Record<string, unknown>, field: string): string | null {
	const value = payload[field];
	if (value === null) {
		return null;
	}

	if (typeof value !== "string") {
		assert.fail(`${field} must be a string or null`);
	}

	return value;
}
