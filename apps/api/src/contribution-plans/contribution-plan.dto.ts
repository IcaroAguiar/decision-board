import { type StrategyId, strategyIds } from "@decision-board/types";
import { BadRequestException } from "@nestjs/common";

export type ContributionFrequencyDto = "monthly";

export interface CreateContributionPlanDto {
	amount: string;
	frequency: ContributionFrequencyDto;
	dayOfMonth: number;
	startsAt: string;
	endsAt?: string | null;
	isActive?: boolean;
	defaultStrategyId: StrategyId;
	cashAccountId?: string | null;
}

export interface UpdateContributionPlanDto {
	amount?: string;
	frequency?: ContributionFrequencyDto;
	dayOfMonth?: number;
	startsAt?: string;
	endsAt?: string | null;
	isActive?: boolean;
	defaultStrategyId?: StrategyId;
	cashAccountId?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STRATEGY_IDS = new Set<string>(Object.values(strategyIds));

export function parseContributionPlanId(value: string): string {
	return parseUuid(value, "contributionPlanId");
}

export function parseContributionPlanPortfolioId(value: string): string {
	return parseUuid(value, "portfolioId");
}

export function parseCreateContributionPlanDto(body: unknown): CreateContributionPlanDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"amount",
		"frequency",
		"dayOfMonth",
		"startsAt",
		"endsAt",
		"isActive",
		"defaultStrategyId",
		"cashAccountId",
	]);

	const dto: CreateContributionPlanDto = {
		amount: readPositiveMoneyDecimal(input.amount, "amount"),
		frequency: readFrequency(input.frequency),
		dayOfMonth: readDayOfMonth(input.dayOfMonth),
		startsAt: readDateOnly(input.startsAt, "startsAt"),
		endsAt: readNullableDateOnly(input.endsAt, "endsAt"),
		isActive: readOptionalBoolean(input.isActive, "isActive"),
		defaultStrategyId: readStrategyId(input.defaultStrategyId),
		cashAccountId: readNullableUuid(input.cashAccountId, "cashAccountId"),
	};

	assertDateRange(dto.startsAt, dto.endsAt);

	return dto;
}

export function parseUpdateContributionPlanDto(body: unknown): UpdateContributionPlanDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"amount",
		"frequency",
		"dayOfMonth",
		"startsAt",
		"endsAt",
		"isActive",
		"defaultStrategyId",
		"cashAccountId",
	]);

	const dto: UpdateContributionPlanDto = {};

	if (input.amount !== undefined) {
		dto.amount = readPositiveMoneyDecimal(input.amount, "amount");
	}

	if (input.frequency !== undefined) {
		dto.frequency = readFrequency(input.frequency);
	}

	if (input.dayOfMonth !== undefined) {
		dto.dayOfMonth = readDayOfMonth(input.dayOfMonth);
	}

	if (input.startsAt !== undefined) {
		dto.startsAt = readDateOnly(input.startsAt, "startsAt");
	}

	if (input.endsAt !== undefined) {
		dto.endsAt = readNullableDateOnly(input.endsAt, "endsAt");
	}

	if (input.isActive !== undefined) {
		dto.isActive = readBoolean(input.isActive, "isActive");
	}

	if (input.defaultStrategyId !== undefined) {
		dto.defaultStrategyId = readStrategyId(input.defaultStrategyId);
	}

	if (input.cashAccountId !== undefined) {
		dto.cashAccountId = readNullableUuid(input.cashAccountId, "cashAccountId");
	}

	if (Object.keys(dto).length === 0) {
		throw new BadRequestException("At least one contribution plan field must be provided");
	}

	if (dto.startsAt !== undefined && dto.endsAt !== undefined) {
		assertDateRange(dto.startsAt, dto.endsAt);
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
		throw new BadRequestException(`Unknown contribution plan field: ${unknownFields[0]}`);
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

function readPositiveMoneyDecimal(value: unknown, field: string): string {
	const text = readRequiredString(value, field);

	if (!MONEY_DECIMAL_PATTERN.test(text) || Number(text) <= 0) {
		throw new BadRequestException(
			`${field} must be a positive decimal with up to 12 whole digits and 8 decimals`,
		);
	}

	return text;
}

function readFrequency(value: unknown): ContributionFrequencyDto {
	const text = readRequiredString(value, "frequency");
	if (text !== "monthly") {
		throw new BadRequestException("frequency must be monthly");
	}

	return text;
}

function readDayOfMonth(value: unknown): number {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw new BadRequestException("dayOfMonth must be an integer");
	}

	if (value < 1 || value > 31) {
		throw new BadRequestException("dayOfMonth must be between 1 and 31");
	}

	return value;
}

function readDateOnly(value: unknown, field: string): string {
	const text = readRequiredString(value, field);
	if (!DATE_ONLY_PATTERN.test(text)) {
		throw new BadRequestException(`${field} must be a YYYY-MM-DD date`);
	}

	const date = new Date(`${text}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
		throw new BadRequestException(`${field} must be a valid calendar date`);
	}

	return text;
}

function readNullableDateOnly(value: unknown, field: string): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	return readDateOnly(value, field);
}

function readBoolean(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") {
		throw new BadRequestException(`${field} must be a boolean`);
	}

	return value;
}

function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}

	return readBoolean(value, field);
}

function readStrategyId(value: unknown): StrategyId {
	const text = readRequiredString(value, "defaultStrategyId");
	if (!STRATEGY_IDS.has(text)) {
		throw new BadRequestException("defaultStrategyId must be a known strategy id");
	}

	return text as StrategyId;
}

function readNullableUuid(value: unknown, field: string): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	return parseUuid(readRequiredString(value, field), field);
}

function assertDateRange(startsAt: string, endsAt: string | null | undefined): void {
	if (endsAt !== undefined && endsAt !== null && endsAt < startsAt) {
		throw new BadRequestException("endsAt must be on or after startsAt");
	}
}
