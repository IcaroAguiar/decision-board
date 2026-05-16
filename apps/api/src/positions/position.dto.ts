import { BadRequestException } from "@nestjs/common";

export interface CreatePositionDto {
	assetId: string;
	quantity: string;
	averagePrice?: string | null;
	manualCurrentPrice?: string | null;
	notes?: string | null;
}

export interface UpdatePositionDto {
	quantity?: string;
	averagePrice?: string | null;
	manualCurrentPrice?: string | null;
	notes?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;
const MAX_NOTES_LENGTH = 500;

export function parsePositionId(value: string): string {
	return parseUuid(value, "positionId");
}

export function parsePositionPortfolioId(value: string): string {
	return parseUuid(value, "portfolioId");
}

export function parseCreatePositionDto(body: unknown): CreatePositionDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"assetId",
		"quantity",
		"averagePrice",
		"manualCurrentPrice",
		"notes",
	]);

	return {
		assetId: parseUuid(readRequiredString(input.assetId, "assetId"), "assetId"),
		quantity: readPositiveDecimal(input.quantity, "quantity"),
		averagePrice: readNullableNonNegativeDecimal(input.averagePrice, "averagePrice"),
		manualCurrentPrice: readNullableNonNegativeDecimal(
			input.manualCurrentPrice,
			"manualCurrentPrice",
		),
		notes: readNullableNotes(input.notes),
	};
}

export function parseUpdatePositionDto(body: unknown): UpdatePositionDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, ["quantity", "averagePrice", "manualCurrentPrice", "notes"]);

	const dto: UpdatePositionDto = {};

	if (input.quantity !== undefined) {
		dto.quantity = readPositiveDecimal(input.quantity, "quantity");
	}

	if (input.averagePrice !== undefined) {
		dto.averagePrice = readNullableNonNegativeDecimal(input.averagePrice, "averagePrice");
	}

	if (input.manualCurrentPrice !== undefined) {
		dto.manualCurrentPrice = readNullableNonNegativeDecimal(
			input.manualCurrentPrice,
			"manualCurrentPrice",
		);
	}

	if (input.notes !== undefined) {
		dto.notes = readNullableNotes(input.notes);
	}

	if (
		dto.quantity === undefined &&
		dto.averagePrice === undefined &&
		dto.manualCurrentPrice === undefined &&
		dto.notes === undefined
	) {
		throw new BadRequestException("At least one position field must be provided");
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
		throw new BadRequestException(`Unknown position field: ${unknownFields[0]}`);
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

function readPositiveDecimal(value: unknown, field: string): string {
	const decimal = readNonNegativeDecimal(value, field);

	if (decimal === "0" || Number(decimal) === 0) {
		throw new BadRequestException(`${field} must be greater than zero`);
	}

	return decimal;
}

function readNullableNonNegativeDecimal(value: unknown, field: string): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	return readNonNegativeDecimal(value, field);
}

function readNonNegativeDecimal(value: unknown, field: string): string {
	const text = readRequiredString(value, field);

	if (!DECIMAL_PATTERN.test(text)) {
		throw new BadRequestException(
			`${field} must be a non-negative decimal with up to 12 whole digits and 8 decimals`,
		);
	}

	return text;
}

function readNullableNotes(value: unknown): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	const notes = readRequiredString(value, "notes");
	if (notes.length > MAX_NOTES_LENGTH) {
		throw new BadRequestException(`notes must be at most ${MAX_NOTES_LENGTH} characters`);
	}

	return notes;
}
