import { BadRequestException } from "@nestjs/common";

export interface CreateCashAccountDto {
	name: string;
	type: string;
	balance: string;
	liquidity?: string | null;
	benchmark?: string | null;
	benchmarkPercent?: string | null;
	notes?: string | null;
}

export interface UpdateCashAccountDto {
	name?: string;
	type?: string;
	balance?: string;
	liquidity?: string | null;
	benchmark?: string | null;
	benchmarkPercent?: string | null;
	notes?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;
const PERCENT_DECIMAL_PATTERN = /^(0|[1-9]\d{0,5})(\.\d{1,4})?$/;
const MAX_NAME_LENGTH = 120;
const MAX_CLASSIFICATION_LENGTH = 80;
const MAX_NOTES_LENGTH = 500;

export function parseCashAccountId(value: string): string {
	return parseUuid(value, "cashAccountId");
}

export function parseCashAccountPortfolioId(value: string): string {
	return parseUuid(value, "portfolioId");
}

export function parseCreateCashAccountDto(body: unknown): CreateCashAccountDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"name",
		"type",
		"balance",
		"liquidity",
		"benchmark",
		"benchmarkPercent",
		"notes",
	]);

	return {
		name: readBoundedString(input.name, "name", MAX_NAME_LENGTH),
		type: readBoundedString(input.type, "type", MAX_CLASSIFICATION_LENGTH),
		balance: readMoneyDecimal(input.balance, "balance"),
		liquidity: readNullableBoundedString(input.liquidity, "liquidity", MAX_CLASSIFICATION_LENGTH),
		benchmark: readNullableBoundedString(input.benchmark, "benchmark", MAX_CLASSIFICATION_LENGTH),
		benchmarkPercent: readNullablePercentDecimal(input.benchmarkPercent, "benchmarkPercent"),
		notes: readNullableBoundedString(input.notes, "notes", MAX_NOTES_LENGTH),
	};
}

export function parseUpdateCashAccountDto(body: unknown): UpdateCashAccountDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"name",
		"type",
		"balance",
		"liquidity",
		"benchmark",
		"benchmarkPercent",
		"notes",
	]);

	const dto: UpdateCashAccountDto = {};

	if (input.name !== undefined) {
		dto.name = readBoundedString(input.name, "name", MAX_NAME_LENGTH);
	}

	if (input.type !== undefined) {
		dto.type = readBoundedString(input.type, "type", MAX_CLASSIFICATION_LENGTH);
	}

	if (input.balance !== undefined) {
		dto.balance = readMoneyDecimal(input.balance, "balance");
	}

	if (input.liquidity !== undefined) {
		dto.liquidity = readNullableBoundedString(
			input.liquidity,
			"liquidity",
			MAX_CLASSIFICATION_LENGTH,
		);
	}

	if (input.benchmark !== undefined) {
		dto.benchmark = readNullableBoundedString(
			input.benchmark,
			"benchmark",
			MAX_CLASSIFICATION_LENGTH,
		);
	}

	if (input.benchmarkPercent !== undefined) {
		dto.benchmarkPercent = readNullablePercentDecimal(input.benchmarkPercent, "benchmarkPercent");
	}

	if (input.notes !== undefined) {
		dto.notes = readNullableBoundedString(input.notes, "notes", MAX_NOTES_LENGTH);
	}

	if (
		dto.name === undefined &&
		dto.type === undefined &&
		dto.balance === undefined &&
		dto.liquidity === undefined &&
		dto.benchmark === undefined &&
		dto.benchmarkPercent === undefined &&
		dto.notes === undefined
	) {
		throw new BadRequestException("At least one cash account field must be provided");
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
		throw new BadRequestException(`Unknown cash account field: ${unknownFields[0]}`);
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

function readBoundedString(value: unknown, field: string, maxLength: number): string {
	const text = readRequiredString(value, field);
	if (text.length > maxLength) {
		throw new BadRequestException(`${field} must be at most ${maxLength} characters`);
	}

	return text;
}

function readNullableBoundedString(
	value: unknown,
	field: string,
	maxLength: number,
): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	return readBoundedString(value, field, maxLength);
}

function readMoneyDecimal(value: unknown, field: string): string {
	const text = readRequiredString(value, field);

	if (!MONEY_DECIMAL_PATTERN.test(text)) {
		throw new BadRequestException(
			`${field} must be a non-negative decimal with up to 12 whole digits and 8 decimals`,
		);
	}

	return text;
}

function readNullablePercentDecimal(value: unknown, field: string): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	const text = readRequiredString(value, field);
	if (!PERCENT_DECIMAL_PATTERN.test(text)) {
		throw new BadRequestException(
			`${field} must be a non-negative decimal with up to 6 whole digits and 4 decimals`,
		);
	}

	return text;
}
