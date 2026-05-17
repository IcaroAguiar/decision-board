import type { StrategyId } from "@decision-board/types";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ContributionPlan } from "@prisma/client";
import type {
	ContributionFrequencyDto,
	CreateContributionPlanDto,
	UpdateContributionPlanDto,
} from "./contribution-plan.dto.js";
import { ContributionPlanRepository } from "./contribution-plan.repository.js";

export interface ContributionPlanResponse {
	id: string;
	portfolioId: string;
	amount: string;
	frequency: ContributionFrequencyDto;
	dayOfMonth: number;
	startsAt: string;
	endsAt: string | null;
	isActive: boolean;
	defaultStrategyId: StrategyId;
	cashAccountId: string | null;
	nextCycleDate: string | null;
	createdAt: string;
	updatedAt: string;
}

@Injectable()
export class ContributionPlansService {
	constructor(
		@Inject(ContributionPlanRepository)
		private readonly contributionPlans: ContributionPlanRepository,
	) {}

	async createContributionPlan(
		userId: string,
		portfolioId: string,
		data: CreateContributionPlanDto,
	): Promise<ContributionPlanResponse> {
		const result = await this.contributionPlans.createByUser(userId, portfolioId, data);

		if (result.status === "not-found") {
			throw new NotFoundException("Portfolio or cash account not found");
		}

		return toContributionPlanResponse(result.contributionPlan);
	}

	async listActiveContributionPlans(
		userId: string,
		portfolioId: string,
	): Promise<ContributionPlanResponse[]> {
		const contributionPlans = await this.contributionPlans.findActiveByPortfolio(
			userId,
			portfolioId,
		);

		if (!contributionPlans) {
			throw new NotFoundException("Portfolio not found");
		}

		return contributionPlans.map(toContributionPlanResponse);
	}

	async updateContributionPlan(
		userId: string,
		contributionPlanId: string,
		data: UpdateContributionPlanDto,
	): Promise<ContributionPlanResponse> {
		const existing = await this.contributionPlans.findByUser(userId, contributionPlanId);

		if (!existing) {
			throw new NotFoundException("Contribution plan not found");
		}

		assertEffectiveDateRange(existing, data);

		const result = await this.contributionPlans.updateByUser(userId, contributionPlanId, data);

		if (result.status === "not-found") {
			throw new NotFoundException("Contribution plan or cash account not found");
		}

		return toContributionPlanResponse(result.contributionPlan);
	}
}

function assertEffectiveDateRange(
	existing: ContributionPlan,
	data: UpdateContributionPlanDto,
): void {
	const startsAt = data.startsAt ?? toDateOnly(existing.startsAt);
	const endsAt =
		data.endsAt === undefined ? existing.endsAt && toDateOnly(existing.endsAt) : data.endsAt;

	if (endsAt !== null && endsAt < startsAt) {
		throw new BadRequestException("endsAt must be on or after startsAt");
	}
}

function toContributionPlanResponse(contributionPlan: ContributionPlan): ContributionPlanResponse {
	return {
		id: contributionPlan.id,
		portfolioId: contributionPlan.portfolioId,
		amount: contributionPlan.amount.toString(),
		frequency: toApiFrequency(contributionPlan.frequency),
		dayOfMonth: contributionPlan.dayOfMonth,
		startsAt: toDateOnly(contributionPlan.startsAt),
		endsAt: contributionPlan.endsAt && toDateOnly(contributionPlan.endsAt),
		isActive: contributionPlan.isActive,
		defaultStrategyId: contributionPlan.defaultStrategyId as StrategyId,
		cashAccountId: contributionPlan.cashAccountId,
		nextCycleDate: calculateNextCycleDate(contributionPlan),
		createdAt: contributionPlan.createdAt.toISOString(),
		updatedAt: contributionPlan.updatedAt.toISOString(),
	};
}

function toApiFrequency(frequency: ContributionPlan["frequency"]): ContributionFrequencyDto {
	if (frequency !== "MONTHLY") {
		throw new Error(`Unsupported contribution frequency: ${frequency}`);
	}

	return "monthly";
}

function calculateNextCycleDate(
	contributionPlan: ContributionPlan,
	now = new Date(),
): string | null {
	if (!contributionPlan.isActive) {
		return null;
	}

	const startsAt = toDateOnly(contributionPlan.startsAt);
	const endsAt = contributionPlan.endsAt && toDateOnly(contributionPlan.endsAt);
	const today = toDateOnly(now);
	let candidate = nextMonthlyDateOnOrAfter(
		maxDateOnly(startsAt, today),
		contributionPlan.dayOfMonth,
	);

	if (candidate < startsAt) {
		candidate = nextMonthlyDateOnOrAfter(nextMonth(candidate), contributionPlan.dayOfMonth);
	}

	if (candidate < today) {
		candidate = nextMonthlyDateOnOrAfter(nextMonth(candidate), contributionPlan.dayOfMonth);
	}

	if (endsAt !== null && candidate > endsAt) {
		return null;
	}

	return candidate;
}

function nextMonthlyDateOnOrAfter(dateOnly: string, dayOfMonth: number): string {
	const { year, month } = parseYearMonth(dateOnly);
	let candidate = buildDateOnly(year, month - 1, dayOfMonth);

	if (candidate < dateOnly) {
		candidate = buildDateOnly(year, month, dayOfMonth);
	}

	return candidate;
}

function buildDateOnly(year: number, monthIndex: number, dayOfMonth: number): string {
	const normalized = new Date(Date.UTC(year, monthIndex, 1));
	const normalizedYear = normalized.getUTCFullYear();
	const normalizedMonth = normalized.getUTCMonth();
	const lastDay = new Date(Date.UTC(normalizedYear, normalizedMonth + 1, 0)).getUTCDate();
	const date = new Date(Date.UTC(normalizedYear, normalizedMonth, Math.min(dayOfMonth, lastDay)));

	return toDateOnly(date);
}

function nextMonth(dateOnly: string): string {
	const { year, month } = parseYearMonth(dateOnly);
	return buildDateOnly(year, month, 1);
}

function parseYearMonth(dateOnly: string): { year: number; month: number } {
	const year = Number(dateOnly.slice(0, 4));
	const month = Number(dateOnly.slice(5, 7));

	return { year, month };
}

function maxDateOnly(left: string, right: string): string {
	return left > right ? left : right;
}

function toDateOnly(date: Date): string {
	return date.toISOString().slice(0, 10);
}
