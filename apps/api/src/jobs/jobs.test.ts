import assert from "node:assert/strict";
import test from "node:test";
import { strategyIds } from "@decision-board/types";
import {
	clearAuthRateLimits,
	jsonHeaders,
	signUpTestUser,
	type TestUser,
} from "../test/auth-test-user.js";
import { configureTestEnvironment, createTestApp, readJson } from "../test/http-test-app.js";
import { jobNames, reportRecommendationReasons } from "./job-names.js";
import { JobsRepository, toCycleMonthDate } from "./jobs.repository.js";
import { JobsService } from "./jobs.service.js";

const TEST_EMAIL_PREFIX = "test-jobs-";
const UNKNOWN_STRATEGY_ID = "retired_strategy";

interface PortfolioPayload {
	id: string;
}

interface ContributionPlanPayload {
	id: string;
}

interface ContributionPlanOptions {
	amount?: string;
	startsAt?: string;
	endsAt?: string | null;
	isActive?: boolean;
	defaultStrategyId?: string;
}

interface CapturedJobSend {
	name: string;
	data: unknown;
	options: Record<string, unknown>;
}

interface FakeBossForEnqueue {
	send(name: string, data: unknown, options: Record<string, unknown>): Promise<string | null>;
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
	options: ContributionPlanOptions = {},
): Promise<ContributionPlanPayload> {
	const body: Record<string, unknown> = {
		amount: options.amount ?? "1000",
		frequency: "monthly",
		dayOfMonth: 10,
		startsAt: options.startsAt ?? "2099-01-01",
		isActive: options.isActive,
		defaultStrategyId: options.defaultStrategyId ?? strategyIds.balancedGrowth,
	};

	if (options.endsAt !== undefined) {
		body.endsAt = options.endsAt;
	}

	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/contribution-plans`, {
		method: "POST",
		headers: jsonHeaders(user),
		body: JSON.stringify(body),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.id, "string");

	return payload as unknown as ContributionPlanPayload;
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

test("starts and stops pg-boss idempotently against the existing Postgres connection", async () => {
	configureTestEnvironment();

	const jobs = new JobsService(new JobsRepository());

	try {
		await jobs.start({ registerWorkers: false });
		await jobs.start({ registerWorkers: false });
	} finally {
		await jobs.stop();
		await jobs.stop();
		const { prisma } = await import("../auth/prisma.client.js");
		await prisma.$disconnect();
	}
});

test("skips pg-boss startup unless jobs are explicitly enabled", async () => {
	const originalJobsEnabled = process.env.JOBS_ENABLED;
	const originalDatabaseUrl = process.env.DATABASE_URL;
	delete process.env.JOBS_ENABLED;
	delete process.env.DATABASE_URL;

	try {
		const jobs = new JobsService(new JobsRepository());

		await jobs.onModuleInit();
		await jobs.onModuleDestroy();
	} finally {
		restoreEnv("JOBS_ENABLED", originalJobsEnabled);
		restoreEnv("DATABASE_URL", originalDatabaseUrl);
	}
});

test("requires started pg-boss before enqueueing jobs", async () => {
	const jobs = new JobsService(new JobsRepository());

	await assert.rejects(
		jobs.enqueueCreateMonthlyContributionCycles({ cycleMonth: "2099-05" }),
		/Jobs service has not been started/,
	);
	await assert.rejects(
		jobs.enqueueCheckReportDue({ now: "2099-06-15T00:00:00.000Z" }),
		/Jobs service has not been started/,
	);
});

test("enqueues cycle and report jobs with singleton keys", async () => {
	const sentJobs: CapturedJobSend[] = [];
	const fakeBoss: FakeBossForEnqueue = {
		async send(name, data, options) {
			sentJobs.push({ name, data, options });
			return `job-${sentJobs.length}`;
		},
	};
	const jobs = new JobsService(new JobsRepository());
	(jobs as unknown as { boss: FakeBossForEnqueue }).boss = fakeBoss;

	const cycleJobId = await jobs.enqueueCreateMonthlyContributionCycles({
		cycleMonth: "2099-05",
	});
	const reportJobId = await jobs.enqueueCheckReportDue({
		now: "2099-06-15T12:34:56.000Z",
	});
	const defaultCycleJobId = await jobs.enqueueCreateMonthlyContributionCycles();
	const defaultReportJobId = await jobs.enqueueCheckReportDue();

	assert.equal(cycleJobId, "job-1");
	assert.equal(reportJobId, "job-2");
	assert.equal(defaultCycleJobId, "job-3");
	assert.equal(defaultReportJobId, "job-4");
	assert.equal(sentJobs.length, 4);
	assert.equal(sentJobs[0]?.name, jobNames.createMonthlyContributionCycles);
	assert.deepEqual(sentJobs[0]?.data, { cycleMonth: "2099-05" });
	assert.equal(sentJobs[0]?.options.singletonKey, "2099-05");
	assert.equal(sentJobs[0]?.options.singletonSeconds, 86_400);
	assert.equal(sentJobs[1]?.name, jobNames.checkReportDue);
	assert.deepEqual(sentJobs[1]?.data, { now: "2099-06-15T12:34:56.000Z" });
	assert.equal(sentJobs[1]?.options.singletonKey, "2099-06-15");
	assert.equal(sentJobs[1]?.options.singletonSeconds, 86_400);
	assert.equal(sentJobs[2]?.name, jobNames.createMonthlyContributionCycles);
	assert.deepEqual(sentJobs[2]?.data, {});
	assert.match(String(sentJobs[2]?.options.singletonKey), /^\d{4}-\d{2}$/);
	assert.equal(sentJobs[3]?.name, jobNames.checkReportDue);
	assert.deepEqual(sentJobs[3]?.data, {});
	assert.match(String(sentJobs[3]?.options.singletonKey), /^\d{4}-\d{2}-\d{2}$/);
});

test("creates monthly contribution cycles idempotently from active plans", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);
	const userA = await signUpTestUser(baseUrl, "jobs-cycle-a");
	const userB = await signUpTestUser(baseUrl, "jobs-cycle-b");
	const portfolioA = await createPortfolio(baseUrl, userA, "Jobs cycles A");
	const portfolioB = await createPortfolio(baseUrl, userB, "Jobs cycles B");
	const planA = await createContributionPlan(baseUrl, userA, portfolioA.id, { amount: "1000" });
	const planB = await createContributionPlan(baseUrl, userB, portfolioB.id, { amount: "900" });
	const inactivePlan = await createContributionPlan(baseUrl, userA, portfolioA.id, {
		amount: "800",
		isActive: false,
	});
	const futurePlan = await createContributionPlan(baseUrl, userA, portfolioA.id, {
		amount: "700",
		startsAt: "2099-06-01",
	});
	const endedPlan = await createContributionPlan(baseUrl, userA, portfolioA.id, {
		amount: "600",
		endsAt: "2099-04-30",
	});

	try {
		const jobs = new JobsService(new JobsRepository());
		const cycleMonth = "2099-05";
		const cycleMonthDate = toCycleMonthDate(cycleMonth);

		const firstRun = await jobs.runCreateMonthlyContributionCycles({ cycleMonth });
		assert.equal(firstRun.cycleMonth, cycleMonth);
		assert.ok(firstRun.createdCycles >= 2);

		const createdCycles = await prisma.contributionCycle.findMany({
			where: {
				contributionPlanId: {
					in: [planA.id, planB.id],
				},
				cycleMonth: cycleMonthDate,
			},
			orderBy: {
				contributionPlanId: "asc",
			},
		});
		assert.equal(createdCycles.length, 2);
		const cyclesByPlan = new Map(
			createdCycles.map((contributionCycle) => [
				contributionCycle.contributionPlanId,
				contributionCycle,
			]),
		);
		assert.equal(cyclesByPlan.get(planA.id)?.userId, userA.userId);
		assert.equal(cyclesByPlan.get(planA.id)?.portfolioId, portfolioA.id);
		assert.equal(cyclesByPlan.get(planA.id)?.plannedAmount.toString(), "1000");
		assert.equal(cyclesByPlan.get(planB.id)?.userId, userB.userId);
		assert.equal(cyclesByPlan.get(planB.id)?.portfolioId, portfolioB.id);
		assert.equal(cyclesByPlan.get(planB.id)?.plannedAmount.toString(), "900");

		const skippedPlanCycleCount = await prisma.contributionCycle.count({
			where: {
				contributionPlanId: {
					in: [inactivePlan.id, futurePlan.id, endedPlan.id],
				},
				cycleMonth: cycleMonthDate,
			},
		});
		assert.equal(skippedPlanCycleCount, 0);

		const secondRun = await jobs.runCreateMonthlyContributionCycles({ cycleMonth });
		assert.equal(secondRun.createdCycles, 0);
		const totalCreatedCycles = await prisma.contributionCycle.count({
			where: {
				contributionPlanId: {
					in: [planA.id, planB.id],
				},
				cycleMonth: cycleMonthDate,
			},
		});
		assert.equal(totalCreatedCycles, 2);
	} finally {
		await prisma.user.deleteMany({
			where: {
				email: {
					in: [userA.email, userB.email],
				},
			},
		});
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("marks confirmed cycles as report due once the strategy cadence has elapsed", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "jobs-report-due");
	const portfolio = await createPortfolio(baseUrl, user, "Jobs report due");
	const confirmedPlan = await createContributionPlan(baseUrl, user, portfolio.id, {
		amount: "1000",
		defaultStrategyId: strategyIds.balancedGrowth,
	});
	const pendingPlan = await createContributionPlan(baseUrl, user, portfolio.id, {
		amount: "500",
		defaultStrategyId: strategyIds.opportunistic,
	});

	try {
		const jobs = new JobsService(new JobsRepository());
		const cycleMonth = "2099-05";
		const cycleMonthDate = toCycleMonthDate(cycleMonth);
		await jobs.runCreateMonthlyContributionCycles({ cycleMonth });

		const confirmedCycle = await prisma.contributionCycle.findFirstOrThrow({
			where: {
				contributionPlanId: confirmedPlan.id,
				cycleMonth: cycleMonthDate,
			},
		});
		const pendingCycle = await prisma.contributionCycle.findFirstOrThrow({
			where: {
				contributionPlanId: pendingPlan.id,
				cycleMonth: cycleMonthDate,
			},
		});

		await prisma.contributionCycle.update({
			where: {
				id: confirmedCycle.id,
			},
			data: {
				status: "CONFIRMED",
				confirmedAmount: "1200",
			},
		});

		const firstRun = await jobs.runCheckReportDue({
			now: "2099-06-15T00:00:00.000Z",
		});
		assert.ok(firstRun.markedCycles >= 1);

		const markedCycle = await prisma.contributionCycle.findUniqueOrThrow({
			where: {
				id: confirmedCycle.id,
			},
		});
		assert.equal(markedCycle.reportRecommendedAt?.toISOString(), "2099-06-15T00:00:00.000Z");
		assert.equal(
			markedCycle.reportRecommendationReason,
			reportRecommendationReasons.strategyReportIntervalElapsed,
		);

		const stillPendingCycle = await prisma.contributionCycle.findUniqueOrThrow({
			where: {
				id: pendingCycle.id,
			},
		});
		assert.equal(stillPendingCycle.reportRecommendedAt, null);
		assert.equal(stillPendingCycle.reportRecommendationReason, null);

		const secondRun = await jobs.runCheckReportDue({
			now: "2099-06-15T00:00:00.000Z",
		});
		assert.equal(secondRun.markedCycles, 0);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

test("continues report due checks past unknown strategy batches", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);
	const user = await signUpTestUser(baseUrl, "jobs-report-due-pagination");
	const portfolio = await createPortfolio(baseUrl, user, "Jobs report pagination");
	const plan = await createContributionPlan(baseUrl, user, portfolio.id, {
		amount: "1000",
		defaultStrategyId: strategyIds.balancedGrowth,
	});

	try {
		const jobs = new JobsService(new JobsRepository());
		const validCycleId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
		const now = new Date("2100-01-01T00:00:00.000Z");
		const unknownCycleCount = 500;

		await prisma.contributionCycle.createMany({
			data: [
				...Array.from({ length: unknownCycleCount }, (_item, index) => ({
					id: orderedTestUuid(index + 1),
					userId: user.userId,
					portfolioId: portfolio.id,
					contributionPlanId: plan.id,
					cycleMonth: addUtcMonths("2050-01", index),
					plannedAmount: "1000",
					confirmedAmount: "1000",
					status: "CONFIRMED" as const,
					strategyId: UNKNOWN_STRATEGY_ID,
					createdAt: now,
					updatedAt: now,
				})),
				{
					id: validCycleId,
					userId: user.userId,
					portfolioId: portfolio.id,
					contributionPlanId: plan.id,
					cycleMonth: toCycleMonthDate("2099-05"),
					plannedAmount: "1000",
					confirmedAmount: "1000",
					status: "CONFIRMED" as const,
					strategyId: strategyIds.balancedGrowth,
					createdAt: now,
					updatedAt: now,
				},
			],
		});

		const result = await jobs.runCheckReportDue({
			now: now.toISOString(),
		});
		assert.equal(result.checkedCycles, unknownCycleCount + 1);
		assert.equal(result.skippedUnknownStrategies, unknownCycleCount);
		assert.equal(result.markedCycles, 1);

		const markedCycle = await prisma.contributionCycle.findUniqueOrThrow({
			where: {
				id: validCycleId,
			},
		});
		assert.equal(markedCycle.reportRecommendedAt?.toISOString(), now.toISOString());

		const markedUnknownCycles = await prisma.contributionCycle.count({
			where: {
				userId: user.userId,
				strategyId: UNKNOWN_STRATEGY_ID,
				reportRecommendedAt: {
					not: null,
				},
			},
		});
		assert.equal(markedUnknownCycles, 0);
	} finally {
		await prisma.user.deleteMany({ where: { email: user.email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});

function addUtcMonths(cycleMonth: string, offset: number): Date {
	const [yearText, monthText] = cycleMonth.split("-");
	return new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
}

function orderedTestUuid(index: number): string {
	return `00000000-0000-0000-0000-${index.toString(16).padStart(12, "0")}`;
}
