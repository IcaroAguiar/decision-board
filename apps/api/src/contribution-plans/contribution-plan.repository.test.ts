import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { strategyIds } from "@decision-board/types";
import { prisma } from "../auth/prisma.client.js";
import { ContributionPlanRepository } from "./contribution-plan.repository.js";

const TEST_EMAIL_PREFIX = "test-contribution-plan-repository-";
const MONTHLY_FREQUENCY = "monthly";
const NOT_FOUND_STATUS = "not-found";
const CREATED_STATUS = "created";
const UPDATED_STATUS = "updated";
const TEST_CASH_ACCOUNT_TYPE = "CDB";

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

async function createCashAccount(
	userId: string,
	portfolioId: string,
	name: string,
): Promise<{ id: string }> {
	return prisma.cashAccount.create({
		data: {
			userId,
			portfolioId,
			name,
			type: TEST_CASH_ACCOUNT_TYPE,
			balance: "1000",
		},
		select: {
			id: true,
		},
	});
}

test("scopes contribution plan repository references and active listing", async () => {
	const repository = new ContributionPlanRepository();
	const userA = await createUser("a");
	const userB = await createUser("b");
	const portfolioA = await createPortfolio(userA.id, "Contribution plan repository A");
	const portfolioB = await createPortfolio(userB.id, "Contribution plan repository B");
	const cashAccountA = await createCashAccount(userA.id, portfolioA.id, "Cash A");
	const cashAccountB = await createCashAccount(userB.id, portfolioB.id, "Cash B");

	try {
		const missingPortfolio = await repository.createByUser(userA.id, portfolioB.id, {
			amount: "1000",
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 10,
			startsAt: "2099-01-01",
			defaultStrategyId: strategyIds.balancedGrowth,
		});
		assert.equal(missingPortfolio.status, NOT_FOUND_STATUS);

		const foreignCashAccount = await repository.createByUser(userA.id, portfolioA.id, {
			amount: "1000",
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 10,
			startsAt: "2099-01-01",
			defaultStrategyId: strategyIds.balancedGrowth,
			cashAccountId: cashAccountB.id,
		});
		assert.equal(foreignCashAccount.status, NOT_FOUND_STATUS);

		const laterPlan = await repository.createByUser(userA.id, portfolioA.id, {
			amount: "1200",
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 20,
			startsAt: "2099-03-01",
			defaultStrategyId: strategyIds.balancedGrowth,
			cashAccountId: cashAccountA.id,
		});
		assert.equal(laterPlan.status, CREATED_STATUS);

		const earlierPlan = await repository.createByUser(userA.id, portfolioA.id, {
			amount: "900",
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 5,
			startsAt: "2099-02-01",
			endsAt: "2099-12-31",
			defaultStrategyId: strategyIds.defensive,
			cashAccountId: null,
		});
		assert.equal(earlierPlan.status, CREATED_STATUS);

		const inactivePlan = await repository.createByUser(userA.id, portfolioA.id, {
			amount: "700",
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 1,
			startsAt: "2099-01-01",
			isActive: false,
			defaultStrategyId: strategyIds.opportunistic,
		});
		assert.equal(inactivePlan.status, CREATED_STATUS);

		const activePlans = await repository.findActiveByPortfolio(userA.id, portfolioA.id);
		assert.deepEqual(
			activePlans?.map((plan) => plan.id),
			[earlierPlan.contributionPlan.id, laterPlan.contributionPlan.id],
		);
		assert.equal(activePlans?.[0]?.amount.toString(), "900");
		assert.equal(activePlans?.[0]?.endsAt?.toISOString(), "2099-12-31T00:00:00.000Z");
		assert.equal(
			activePlans?.some((plan) => plan.id === inactivePlan.contributionPlan.id),
			false,
		);
		assert.equal(await repository.findActiveByPortfolio(userB.id, portfolioA.id), null);

		const updateMissingPlan = await repository.updateByUser(
			userB.id,
			laterPlan.contributionPlan.id,
			{
				amount: "1300",
			},
		);
		assert.equal(updateMissingPlan.status, NOT_FOUND_STATUS);

		const updateForeignCashAccount = await repository.updateByUser(
			userA.id,
			laterPlan.contributionPlan.id,
			{
				cashAccountId: cashAccountB.id,
			},
		);
		assert.equal(updateForeignCashAccount.status, NOT_FOUND_STATUS);

		const updateOwnPlan = await repository.updateByUser(userA.id, laterPlan.contributionPlan.id, {
			amount: "1300.25",
			cashAccountId: null,
			endsAt: null,
			isActive: true,
		});
		assert.equal(updateOwnPlan.status, UPDATED_STATUS);
		assert.equal(updateOwnPlan.contributionPlan.amount.toString(), "1300.25");
		assert.equal(updateOwnPlan.contributionPlan.cashAccountId, null);
		assert.equal(updateOwnPlan.contributionPlan.endsAt, null);

		const replacementCashAccount = await createCashAccount(
			userA.id,
			portfolioA.id,
			"Replacement cash",
		);
		const updateSchedule = await repository.updateByUser(userA.id, laterPlan.contributionPlan.id, {
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 25,
			startsAt: "2099-04-01",
			endsAt: "2099-10-31",
			defaultStrategyId: strategyIds.highIncome,
			cashAccountId: replacementCashAccount.id,
		});
		assert.equal(updateSchedule.status, UPDATED_STATUS);
		assert.equal(updateSchedule.contributionPlan.frequency, "MONTHLY");
		assert.equal(updateSchedule.contributionPlan.dayOfMonth, 25);
		assert.equal(
			updateSchedule.contributionPlan.startsAt.toISOString(),
			"2099-04-01T00:00:00.000Z",
		);
		assert.equal(updateSchedule.contributionPlan.endsAt?.toISOString(), "2099-10-31T00:00:00.000Z");
		assert.equal(updateSchedule.contributionPlan.defaultStrategyId, strategyIds.highIncome);
		assert.equal(updateSchedule.contributionPlan.cashAccountId, replacementCashAccount.id);
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
