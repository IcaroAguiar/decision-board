import { BadRequestException } from "@nestjs/common";

export interface CreateManualPriceSnapshotDto {
	price: string;
	currency?: string;
	capturedAt?: string;
}

export interface PriceSnapshotSearchDto {
	limit: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const ASSET_ID_FIELD = "assetId";

export function parseMarketDataAssetId(value: string): string {
	return parseUuid(value, ASSET_ID_FIELD);
}

export function parseCreateManualPriceSnapshotDto(body: unknown): CreateManualPriceSnapshotDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, ["price", "currency", "capturedAt"]);

	return {
		price: readPositiveDecimal(input.price, "price"),
		currency: input.currency === undefined ? undefined : readCurrency(input.currency, "currency"),
		capturedAt:
			input.capturedAt === undefined ? undefined : readIsoTimestamp(input.capturedAt, "capturedAt"),
	};
}

export function parsePriceSnapshotSearchDto(query: unknown): PriceSnapshotSearchDto {
	const input = query && typeof query === "object" && !Array.isArray(query) ? query : {};
	assertAllowedFields(input as Record<string, unknown>, ["limit"]);

	return {
		limit: readLimit((input as Record<string, unknown>).limit),
	};
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
		throw new BadRequestException(`Unknown market data field: ${unknownFields[0]}`);
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
	const text = readRequiredString(value, field);

	if (!DECIMAL_PATTERN.test(text) || Number(text) === 0) {
		throw new BadRequestException(
			`${field} must be a positive decimal with up to 12 whole digits and 8 decimals`,
		);
	}

	return text;
}

function readCurrency(value: unknown, field: string): string {
	const currency = readRequiredString(value, field).toUpperCase();

	if (!CURRENCY_PATTERN.test(currency)) {
		throw new BadRequestException(`${field} must be a 3-letter currency code`);
	}

	return currency;
}

function readIsoTimestamp(value: unknown, field: string): string {
	const timestamp = readRequiredString(value, field);
	const date = new Date(timestamp);

	if (Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) {
		throw new BadRequestException(`${field} must be an ISO timestamp`);
	}

	return timestamp;
}

function readLimit(value: unknown): number {
	if (value === undefined) {
		return DEFAULT_LIST_LIMIT;
	}

	const limit = typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
		throw new BadRequestException(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}`);
	}

	return limit;
}
