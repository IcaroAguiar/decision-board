import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { contributionCycleStatuses, strategyIds } from "@decision-board/types";
import { prisma } from "../auth/prisma.client.js";
import { ContributionCycleRepository } from "./contribution-cycle.repository.js";

const TEST_EMAIL_PREFIX = "test-contribution-cycle-repository-";
const PRISMA_MONTHLY_FREQUENCY = "MONTHLY";
const CREATED_STATUS = "created";
const DUPLICATE_STATUS = "duplicate";
const NOT_FOUND_STATUS = "not-found";
const UPDATED_STATUS = "updated";
const CYCLE_MONTH_MAY = "2099-05";
const CYCLE_MONTH_JUNE = "2099-06";
const PLAN_START_DATE = new Date("2099-01-01T00:00:00.000Z");

async function createUser(label: string): Promise<{ id: string; email: string }> {
	const email = `${TEST_EMAIL_PREFIX}${label}-${randomUUID()}@example.com`;

	return prisma.user.create({
		data: {
			email,
			emailVerified: true,
		},
		select: {
			id: true,
			email: true,
		},
	});
}

async function createPortfolio(userId: string, name: string): Promise<{ id: string }> {
	return prisma.portfolio.create({
		data: {
			userId,
			name,
		},
		select: {
			id: true,
		},
	});
}

async function createContributionPlan(
	userId: string,
	portfolioId: string,
	amount: string,
): Promise<{ id: string }> {
	return prisma.contributionPlan.create({
		data: {
			userId,
			portfolioId,
			amount,
			frequency: PRISMA_MONTHLY_FREQUENCY,
			dayOfMonth: 10,
			startsAt: PLAN_START_DATE,
			defaultStrategyId: strategyIds.balancedGrowth,
		},
		select: {
			id: true,
		},
	});
}

test("scopes contribution cycle repository plans, listing, and status updates", async () => {
	const repository = new ContributionCycleRepository();
	const userA = await createUser("a");
	const userB = await createUser("b");
	const portfolioA = await createPortfolio(userA.id, "Contribution cycle repository A");
	const portfolioB = await createPortfolio(userB.id, "Contribution cycle repository B");
	const planA = await createContributionPlan(userA.id, portfolioA.id, "1000");
	const secondPlanA = await createContributionPlan(userA.id, portfolioA.id, "800");
	const planB = await createContributionPlan(userB.id, portfolioB.id, "900");

	try {
		const missingPlan = await repository.createByUser(userA.id, planB.id, {
			cycleMonth: CYCLE_MONTH_MAY,
		});
		assert.equal(missingPlan.status, NOT_FOUND_STATUS);

		const mayCycle = await repository.createByUser(userA.id, planA.id, {
			cycleMonth: CYCLE_MONTH_MAY,
			strategyId: strategyIds.defensive,
		});
		assert.equal(mayCycle.status, CREATED_STATUS);
		assert.equal(mayCycle.contributionCycle.userId, userA.id);
		assert.equal(mayCycle.contributionCycle.portfolioId, portfolioA.id);
		assert.equal(mayCycle.contributionCycle.contributionPlanId, planA.id);
		assert.equal(mayCycle.contributionCycle.plannedAmount.toString(), "1000");
		assert.equal(mayCycle.contributionCycle.status, "PENDING");
		assert.equal(mayCycle.contributionCycle.strategyId, strategyIds.defensive);

		const duplicateCycle = await repository.createByUser(userA.id, planA.id, {
			cycleMonth: CYCLE_MONTH_MAY,
		});
		assert.equal(duplicateCycle.status, DUPLICATE_STATUS);

		const juneCycle = await repository.createByUser(userA.id, secondPlanA.id, {
			cycleMonth: CYCLE_MONTH_JUNE,
		});
		assert.equal(juneCycle.status, CREATED_STATUS);
		assert.equal(juneCycle.contributionCycle.strategyId, strategyIds.balancedGrowth);

		const ownCycles = await repository.findManyByPortfolio(userA.id, portfolioA.id);
		assert.deepEqual(
			ownCycles?.map((cycle) => cycle.id),
			[juneCycle.contributionCycle.id, mayCycle.contributionCycle.id],
		);
		assert.equal(await repository.findManyByPortfolio(userB.id, portfolioA.id), null);
		assert.equal(
			(await repository.findByUser(userA.id, mayCycle.contributionCycle.id))?.id,
			mayCycle.contributionCycle.id,
		);
		assert.equal(await repository.findByUser(userB.id, mayCycle.contributionCycle.id), null);

		const updateOtherUser = await repository.updateByUser(userB.id, mayCycle.contributionCycle.id, {
			status: contributionCycleStatuses.confirmed,
			confirmedAmount: "1100",
		});
		assert.equal(updateOtherUser.status, NOT_FOUND_STATUS);

		const confirmed = await repository.updateByUser(userA.id, mayCycle.contributionCycle.id, {
			status: contributionCycleStatuses.confirmed,
			confirmedAmount: "1100",
			notes: "Aporte confirmado",
		});
		assert.equal(confirmed.status, UPDATED_STATUS);
		assert.equal(confirmed.contributionCycle.status, "CONFIRMED");
		assert.equal(confirmed.contributionCycle.confirmedAmount?.toString(), "1100");
		assert.equal(confirmed.contributionCycle.notes, "Aporte confirmado");

		const skipped = await repository.updateByUser(userA.id, mayCycle.contributionCycle.id, {
			status: contributionCycleStatuses.skipped,
			confirmedAmount: null,
			notes: null,
		});
		assert.equal(skipped.status, UPDATED_STATUS);
		assert.equal(skipped.contributionCycle.status, "SKIPPED");
		assert.equal(skipped.contributionCycle.confirmedAmount, null);
		assert.equal(skipped.contributionCycle.notes, null);

		const reported = await repository.updateByUser(userA.id, mayCycle.contributionCycle.id, {
			status: contributionCycleStatuses.reported,
			strategyId: strategyIds.opportunistic,
		});
		assert.equal(reported.status, UPDATED_STATUS);
		assert.equal(reported.contributionCycle.status, "REPORTED");
		assert.equal(reported.contributionCycle.strategyId, strategyIds.opportunistic);

		const closed = await repository.updateByUser(userA.id, mayCycle.contributionCycle.id, {
			status: contributionCycleStatuses.closed,
		});
		assert.equal(closed.status, UPDATED_STATUS);
		assert.equal(closed.contributionCycle.status, "CLOSED");

		const pending = await repository.updateByUser(userA.id, mayCycle.contributionCycle.id, {
			status: contributionCycleStatuses.pending,
		});
		assert.equal(pending.status, UPDATED_STATUS);
		assert.equal(pending.contributionCycle.status, "PENDING");
	} finally {
		await prisma.user.deleteMany({
			where: {
				email: {
					in: [userA.email, userB.email],
				},
			},
		});
		await prisma.$disconnect();
	}
});
