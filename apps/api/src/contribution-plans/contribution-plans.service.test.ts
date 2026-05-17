import assert from "node:assert/strict";
import test from "node:test";
import { strategyIds } from "@decision-board/types";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { type ContributionPlan, Prisma } from "@prisma/client";
import type {
	CreateContributionPlanDto,
	UpdateContributionPlanDto,
} from "./contribution-plan.dto.js";
import {
	ContributionPlanRepository,
	type CreateContributionPlanResult,
	type UpdateContributionPlanResult,
} from "./contribution-plan.repository.js";
import {
	type ContributionPlanResponse,
	ContributionPlansService,
} from "./contribution-plans.service.js";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_PORTFOLIO_ID = "00000000-0000-4000-8000-000000000002";
const TEST_CASH_ACCOUNT_ID = "00000000-0000-4000-8000-000000000003";
const TEST_CONTRIBUTION_PLAN_ID = "00000000-0000-4000-8000-000000000004";
const MONTHLY_FREQUENCY = "monthly";
const FUTURE_YEAR_START = "2099-01-01";
const FUTURE_FEBRUARY_START = "2099-02-01";
const UTC_DATE_SUFFIX = "T00:00:00.000Z";

class FakeContributionPlanRepository extends ContributionPlanRepository {
	createResult: CreateContributionPlanResult = {
		status: "created",
		contributionPlan: createContributionPlan(),
	};
	activePlans: ContributionPlan[] | null = [createContributionPlan()];
	existingPlan: ContributionPlan | null = createContributionPlan();
	updateResult: UpdateContributionPlanResult = {
		status: "updated",
		contributionPlan: createContributionPlan(),
	};
	updateCalls: UpdateContributionPlanDto[] = [];

	override async createByUser(
		_userId: string,
		_portfolioId: string,
		_data: CreateContributionPlanDto,
	): Promise<CreateContributionPlanResult> {
		return this.createResult;
	}

	override async findActiveByPortfolio(
		_userId: string,
		_portfolioId: string,
	): Promise<ContributionPlan[] | null> {
		return this.activePlans;
	}

	override async findByUser(
		_userId: string,
		_contributionPlanId: string,
	): Promise<ContributionPlan | null> {
		return this.existingPlan;
	}

	override async updateByUser(
		_userId: string,
		_contributionPlanId: string,
		data: UpdateContributionPlanDto,
	): Promise<UpdateContributionPlanResult> {
		this.updateCalls.push(data);
		return this.updateResult;
	}
}

test("maps contribution plan responses with next cycle edge cases", async () => {
	const repository = new FakeContributionPlanRepository();
	repository.createResult = {
		status: "created",
		contributionPlan: createContributionPlan({
			amount: decimal("1200.25"),
			dayOfMonth: 31,
			startsAt: dateOnly(FUTURE_FEBRUARY_START),
			endsAt: null,
			cashAccountId: TEST_CASH_ACCOUNT_ID,
			defaultStrategyId: strategyIds.defensive,
		}),
	};
	repository.activePlans = [
		createContributionPlan({
			id: "00000000-0000-4000-8000-000000000011",
			dayOfMonth: 31,
			startsAt: dateOnly(FUTURE_FEBRUARY_START),
			endsAt: null,
		}),
		createContributionPlan({
			id: "00000000-0000-4000-8000-000000000012",
			isActive: false,
			startsAt: dateOnly(FUTURE_YEAR_START),
			endsAt: null,
		}),
		createContributionPlan({
			id: "00000000-0000-4000-8000-000000000013",
			startsAt: dateOnly("2000-01-01"),
			endsAt: dateOnly("2000-12-31"),
		}),
	];
	const service = createService(repository);

	const created = await service.createContributionPlan(TEST_USER_ID, TEST_PORTFOLIO_ID, {
		amount: "1200.25",
		frequency: MONTHLY_FREQUENCY,
		dayOfMonth: 31,
		startsAt: FUTURE_FEBRUARY_START,
		defaultStrategyId: strategyIds.defensive,
		cashAccountId: TEST_CASH_ACCOUNT_ID,
	});
	assert.deepEqual(
		pickResponseFields(created, [
			"amount",
			"frequency",
			"dayOfMonth",
			"startsAt",
			"endsAt",
			"isActive",
			"defaultStrategyId",
			"cashAccountId",
			"nextCycleDate",
		]),
		{
			amount: "1200.25",
			frequency: MONTHLY_FREQUENCY,
			dayOfMonth: 31,
			startsAt: FUTURE_FEBRUARY_START,
			endsAt: null,
			isActive: true,
			defaultStrategyId: strategyIds.defensive,
			cashAccountId: TEST_CASH_ACCOUNT_ID,
			nextCycleDate: "2099-02-28",
		},
	);

	const listed = await service.listActiveContributionPlans(TEST_USER_ID, TEST_PORTFOLIO_ID);
	assert.deepEqual(
		listed.map((plan) => [plan.id, plan.nextCycleDate]),
		[
			["00000000-0000-4000-8000-000000000011", "2099-02-28"],
			["00000000-0000-4000-8000-000000000012", null],
			["00000000-0000-4000-8000-000000000013", null],
		],
	);
});

test("translates repository misses to not found errors", async () => {
	const repository = new FakeContributionPlanRepository();
	const service = createService(repository);

	repository.createResult = { status: "not-found" };
	await assert.rejects(
		() =>
			service.createContributionPlan(TEST_USER_ID, TEST_PORTFOLIO_ID, {
				amount: "1000",
				frequency: MONTHLY_FREQUENCY,
				dayOfMonth: 10,
				startsAt: FUTURE_YEAR_START,
				defaultStrategyId: strategyIds.balancedGrowth,
			}),
		NotFoundException,
	);

	repository.activePlans = null;
	await assert.rejects(
		() => service.listActiveContributionPlans(TEST_USER_ID, TEST_PORTFOLIO_ID),
		NotFoundException,
	);

	repository.existingPlan = null;
	await assert.rejects(
		() =>
			service.updateContributionPlan(TEST_USER_ID, TEST_CONTRIBUTION_PLAN_ID, {
				amount: "1100",
			}),
		NotFoundException,
	);

	repository.existingPlan = createContributionPlan();
	repository.updateResult = { status: "not-found" };
	await assert.rejects(
		() =>
			service.updateContributionPlan(TEST_USER_ID, TEST_CONTRIBUTION_PLAN_ID, {
				amount: "1100",
			}),
		NotFoundException,
	);
});

test("rejects invalid effective date ranges before updating", async () => {
	const repository = new FakeContributionPlanRepository();
	repository.existingPlan = createContributionPlan({
		startsAt: dateOnly("2099-04-01"),
		endsAt: dateOnly("2099-04-30"),
	});
	const service = createService(repository);

	await assert.rejects(
		() =>
			service.updateContributionPlan(TEST_USER_ID, TEST_CONTRIBUTION_PLAN_ID, {
				startsAt: "2099-05-01",
			}),
		BadRequestException,
	);
	assert.equal(repository.updateCalls.length, 0);

	await assert.rejects(
		() =>
			service.updateContributionPlan(TEST_USER_ID, TEST_CONTRIBUTION_PLAN_ID, {
				startsAt: "2099-04-01",
				endsAt: "2099-03-31",
			}),
		BadRequestException,
	);
	assert.equal(repository.updateCalls.length, 0);
});

test("fails closed when persistence returns an unsupported contribution frequency", async () => {
	const repository = new FakeContributionPlanRepository();
	repository.createResult = {
		status: "created",
		contributionPlan: createContributionPlan({
			frequency: "WEEKLY" as ContributionPlan["frequency"],
		}),
	};
	const service = createService(repository);

	await assert.rejects(
		() =>
			service.createContributionPlan(TEST_USER_ID, TEST_PORTFOLIO_ID, {
				amount: "1000",
				frequency: MONTHLY_FREQUENCY,
				dayOfMonth: 10,
				startsAt: FUTURE_YEAR_START,
				defaultStrategyId: strategyIds.balancedGrowth,
			}),
		/Unsupported contribution frequency/,
	);
});

function createService(repository: FakeContributionPlanRepository): ContributionPlansService {
	return new ContributionPlansService(repository);
}

function createContributionPlan(overrides: Partial<ContributionPlan> = {}): ContributionPlan {
	return {
		id: TEST_CONTRIBUTION_PLAN_ID,
		userId: TEST_USER_ID,
		portfolioId: TEST_PORTFOLIO_ID,
		amount: decimal("1000"),
		frequency: "MONTHLY",
		dayOfMonth: 15,
		startsAt: dateOnly(FUTURE_YEAR_START),
		endsAt: dateOnly("2099-12-31"),
		isActive: true,
		defaultStrategyId: strategyIds.balancedGrowth,
		cashAccountId: null,
		createdAt: instant("2098-12-01T00:00:00.000Z"),
		updatedAt: instant("2098-12-02T00:00:00.000Z"),
		...overrides,
	};
}

function pickResponseFields<K extends keyof ContributionPlanResponse>(
	response: ContributionPlanResponse,
	fields: K[],
): Pick<ContributionPlanResponse, K> {
	return Object.fromEntries(fields.map((field) => [field, response[field]])) as Pick<
		ContributionPlanResponse,
		K
	>;
}

function decimal(value: string): ContributionPlan["amount"] {
	return new Prisma.Decimal(value);
}

function dateOnly(value: string): Date {
	return new Date(`${value}${UTC_DATE_SUFFIX}`);
}

function instant(value: string): Date {
	return new Date(value);
}
