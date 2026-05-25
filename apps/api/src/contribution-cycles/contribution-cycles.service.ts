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

		assertStatusTransition(existing, data);
		assertConfirmedAmount(existing, data);

		if (isNoOpUpdate(existing, data)) {
			return toContributionCycleResponse(existing);
		}

		const result = await this.contributionCycles.updateByUser(
			userId,
			contributionCycleId,
			data,
			existing.status,
		);

		if (result.status === "not-found") {
			throw new NotFoundException("Contribution cycle not found");
		}

		if (result.status === "conflict") {
			throw new ConflictException("Contribution cycle changed while updating");
		}

		return toContributionCycleResponse(result.contributionCycle);
	}
}

function assertStatusTransition(
	existing: ContributionCycle,
	data: UpdateContributionCycleDto,
): void {
	const currentStatus = toApiStatus(existing.status);
	const terminalStatuses = new Set<ContributionCycleStatus>([
		contributionCycleStatuses.closed,
		contributionCycleStatuses.reported,
		contributionCycleStatuses.skipped,
	]);

	if (data.status === contributionCycleStatuses.reported && currentStatus !== data.status) {
		throw new ConflictException("Reported status is set by report generation");
	}

	if (
		currentStatus === contributionCycleStatuses.confirmed &&
		data.status !== undefined &&
		data.status !== contributionCycleStatuses.confirmed &&
		data.confirmedAmount !== null
	) {
		throw new BadRequestException(
			"confirmedAmount must be null when leaving confirmed status",
		);
	}

	if (terminalStatuses.has(currentStatus) && !isNoOpUpdate(existing, data)) {
		throw new ConflictException("Terminal contribution cycle status cannot be changed");
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

function isNoOpUpdate(existing: ContributionCycle, data: UpdateContributionCycleDto): boolean {
	const currentStatus = toApiStatus(existing.status);
	return (
		(data.status === undefined || data.status === currentStatus) &&
		(data.confirmedAmount === undefined ||
			data.confirmedAmount === (existing.confirmedAmount?.toString() ?? null)) &&
		(data.strategyId === undefined || data.strategyId === existing.strategyId) &&
		(data.notes === undefined || data.notes === existing.notes)
	);
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
