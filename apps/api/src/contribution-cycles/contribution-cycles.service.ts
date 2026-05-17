import {
	type ContributionCycleStatus,
	contributionCycleStatuses,
	type StrategyId,
} from "@decision-board/types";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { ContributionCycle } from "@prisma/client";
import type {
	CreateContributionCycleDto,
	UpdateContributionCycleDto,
} from "./contribution-cycle.dto.js";
import { ContributionCycleRepository } from "./contribution-cycle.repository.js";

export interface ContributionCycleResponse {
	id: string;
	portfolioId: string;
	contributionPlanId: string;
	cycleMonth: string;
	plannedAmount: string;
	confirmedAmount: string | null;
	status: ContributionCycleStatus;
	strategyId: StrategyId;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

@Injectable()
export class ContributionCyclesService {
	constructor(
		@Inject(ContributionCycleRepository)
		private readonly contributionCycles: ContributionCycleRepository,
	) {}

	async createContributionCycle(
		userId: string,
		contributionPlanId: string,
		data: CreateContributionCycleDto,
	): Promise<ContributionCycleResponse> {
		const result = await this.contributionCycles.createByUser(userId, contributionPlanId, data);

		if (result.status === "not-found") {
			throw new NotFoundException("Contribution plan not found");
		}

		if (result.status === "duplicate") {
			throw new ConflictException("Contribution cycle already exists for this plan and month");
		}

		return toContributionCycleResponse(result.contributionCycle);
	}

	async listContributionCycles(
		userId: string,
		portfolioId: string,
	): Promise<ContributionCycleResponse[]> {
		const contributionCycles = await this.contributionCycles.findManyByPortfolio(
			userId,
			portfolioId,
		);

		if (!contributionCycles) {
			throw new NotFoundException("Portfolio not found");
		}

		return contributionCycles.map(toContributionCycleResponse);
	}

	async updateContributionCycle(
		userId: string,
		contributionCycleId: string,
		data: UpdateContributionCycleDto,
	): Promise<ContributionCycleResponse> {
		const existing = await this.contributionCycles.findByUser(userId, contributionCycleId);

		if (!existing) {
			throw new NotFoundException("Contribution cycle not found");
		}

		assertConfirmedAmount(existing, data);

		const result = await this.contributionCycles.updateByUser(userId, contributionCycleId, data);

		if (result.status === "not-found") {
			throw new NotFoundException("Contribution cycle not found");
		}

		return toContributionCycleResponse(result.contributionCycle);
	}
}

function assertConfirmedAmount(
	existing: ContributionCycle,
	data: UpdateContributionCycleDto,
): void {
	const effectiveStatus = data.status ?? toApiStatus(existing.status);
	const effectiveConfirmedAmount =
		data.confirmedAmount === undefined
			? (existing.confirmedAmount?.toString() ?? null)
			: data.confirmedAmount;

	if (
		effectiveStatus === contributionCycleStatuses.confirmed &&
		effectiveConfirmedAmount === null
	) {
		throw new BadRequestException("confirmedAmount is required when status is confirmed");
	}
}

function toContributionCycleResponse(
	contributionCycle: ContributionCycle,
): ContributionCycleResponse {
	return {
		id: contributionCycle.id,
		portfolioId: contributionCycle.portfolioId,
		contributionPlanId: contributionCycle.contributionPlanId,
		cycleMonth: toCycleMonth(contributionCycle.cycleMonth),
		plannedAmount: contributionCycle.plannedAmount.toString(),
		confirmedAmount: contributionCycle.confirmedAmount?.toString() ?? null,
		status: toApiStatus(contributionCycle.status),
		strategyId: contributionCycle.strategyId as StrategyId,
		notes: contributionCycle.notes,
		createdAt: contributionCycle.createdAt.toISOString(),
		updatedAt: contributionCycle.updatedAt.toISOString(),
	};
}

function toApiStatus(status: ContributionCycle["status"]): ContributionCycleStatus {
	switch (status) {
		case "PENDING":
			return contributionCycleStatuses.pending;
		case "CONFIRMED":
			return contributionCycleStatuses.confirmed;
		case "SKIPPED":
			return contributionCycleStatuses.skipped;
		case "REPORTED":
			return contributionCycleStatuses.reported;
		case "CLOSED":
			return contributionCycleStatuses.closed;
		default:
			throw new Error(`Unsupported contribution cycle status: ${status}`);
	}
}

function toCycleMonth(date: Date): string {
	return date.toISOString().slice(0, 7);
}
