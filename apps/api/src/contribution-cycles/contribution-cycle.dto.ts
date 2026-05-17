import {
	type ContributionCycleStatus,
	contributionCycleStatuses,
	type StrategyId,
	strategyIds,
} from "@decision-board/types";
import { BadRequestException } from "@nestjs/common";

export interface CreateContributionCycleDto {
	cycleMonth: string;
	strategyId?: StrategyId;
}

export interface UpdateContributionCycleDto {
	status?: ContributionCycleStatus;
	confirmedAmount?: string | null;
	strategyId?: StrategyId;
	notes?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;
const CYCLE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const STRATEGY_IDS = new Set<string>(Object.values(strategyIds));
const CYCLE_STATUSES = new Set<string>(Object.values(contributionCycleStatuses));
const MAX_NOTES_LENGTH = 500;

export function parseContributionCycleId(value: string): string {
	return parseUuid(value, "contributionCycleId");
}

export function parseContributionCyclePortfolioId(value: string): string {
	return parseUuid(value, "portfolioId");
}

export function parseContributionCyclePlanId(value: string): string {
	return parseUuid(value, "contributionPlanId");
}

export function parseCreateContributionCycleDto(body: unknown): CreateContributionCycleDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, ["cycleMonth", "strategyId"]);

	const dto: CreateContributionCycleDto = {
		cycleMonth: readCycleMonth(input.cycleMonth),
	};

	if (input.strategyId !== undefined) {
		dto.strategyId = readStrategyId(input.strategyId);
	}

	return dto;
}

export function parseUpdateContributionCycleDto(body: unknown): UpdateContributionCycleDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, ["status", "confirmedAmount", "strategyId", "notes"]);

	const dto: UpdateContributionCycleDto = {};

	if (input.status !== undefined) {
		dto.status = readCycleStatus(input.status);
	}

	if (input.confirmedAmount !== undefined) {
		dto.confirmedAmount = readNullablePositiveMoneyDecimal(
			input.confirmedAmount,
			"confirmedAmount",
		);
	}

	if (input.strategyId !== undefined) {
		dto.strategyId = readStrategyId(input.strategyId);
	}

	if (input.notes !== undefined) {
		dto.notes = readNullableBoundedString(input.notes, "notes", MAX_NOTES_LENGTH);
	}

	if (Object.keys(dto).length === 0) {
		throw new BadRequestException("At least one contribution cycle field must be provided");
	}

	return dto;
}

function parseUuid(value: string, field: string): string {
	if (!UUID_PATTERN.test(value)) {
		throw new BadRequestException(`${field} must be a UUID`);
	}

	return value;
}

function readObjectBody(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new BadRequestException("Request body must be an object");
	}

	return body as Record<string, unknown>;
}

function assertAllowedFields(input: Record<string, unknown>, allowedFields: string[]): void {
	const allowed = new Set(allowedFields);
	const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));

	if (unknownFields.length > 0) {
		throw new BadRequestException(`Unknown contribution cycle field: ${unknownFields[0]}`);
	}
}

function readRequiredString(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new BadRequestException(`${field} must be a string`);
	}

	const text = value.trim();
	if (!text) {
		throw new BadRequestException(`${field} is required`);
	}

	return text;
}

function readCycleMonth(value: unknown): string {
	const text = readRequiredString(value, "cycleMonth");
	if (!CYCLE_MONTH_PATTERN.test(text)) {
		throw new BadRequestException("cycleMonth must be a YYYY-MM month");
	}

	return text;
}

function readCycleStatus(value: unknown): ContributionCycleStatus {
	const text = readRequiredString(value, "status");
	if (!CYCLE_STATUSES.has(text)) {
		throw new BadRequestException("status must be a known contribution cycle status");
	}

	return text as ContributionCycleStatus;
}

function readStrategyId(value: unknown): StrategyId {
	const text = readRequiredString(value, "strategyId");
	if (!STRATEGY_IDS.has(text)) {
		throw new BadRequestException("strategyId must be a known strategy id");
	}

	return text as StrategyId;
}

function readNullablePositiveMoneyDecimal(value: unknown, field: string): string | null {
	if (value === null) {
		return null;
	}

	const text = readRequiredString(value, field);
	if (!MONEY_DECIMAL_PATTERN.test(text) || Number(text) <= 0) {
		throw new BadRequestException(
			`${field} must be a positive decimal with up to 12 whole digits and 8 decimals`,
		);
	}

	return text;
}

function readNullableBoundedString(
	value: unknown,
	field: string,
	maxLength: number,
): string | null {
	if (value === null) {
		return null;
	}

	const text = readRequiredString(value, field);
	if (text.length > maxLength) {
		throw new BadRequestException(`${field} must be at most ${maxLength} characters`);
	}

	return text;
}
