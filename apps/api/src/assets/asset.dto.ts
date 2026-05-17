import { BadRequestException } from "@nestjs/common";
import { AssetType, RiskCategory } from "@prisma/client";

export interface CreateAssetDto {
	ticker: string;
	name: string;
	assetType: AssetType;
	riskCategory: RiskCategory;
	segment?: string;
	currency: string;
	exchange: string;
}

export interface AssetSearchDto {
	ticker?: string;
	q?: string;
	limit: number;
}

export interface UpsertAssetOverrideDto {
	customName?: string | null;
	customAssetType?: AssetType | null;
	customSegment?: string | null;
	customRiskCategory?: RiskCategory | null;
	notes?: string | null;
}

const DEFAULT_CURRENCY = "BRL";
const DEFAULT_EXCHANGE = "B3";
const MAX_TICKER_LENGTH = 24;
const MAX_NAME_LENGTH = 160;
const MAX_SEGMENT_LENGTH = 80;
const MAX_EXCHANGE_LENGTH = 24;
const MAX_NOTES_LENGTH = 500;
const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const TICKER_PATTERN = /^[A-Z0-9.]{1,24}$/;
const ASSET_TYPE_BY_INPUT = createEnumMap(AssetType);
const RISK_CATEGORY_BY_INPUT = createEnumMap(RiskCategory);

export function parseAssetId(value: string): string {
	if (!UUID_PATTERN.test(value)) {
		throw new BadRequestException("assetId must be a UUID");
	}

	return value;
}

export function parseCreateAssetDto(body: unknown): CreateAssetDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"ticker",
		"name",
		"assetType",
		"riskCategory",
		"segment",
		"currency",
		"exchange",
	]);

	return {
		ticker: readTicker(input.ticker),
		name: readRequiredString(input.name, "name", MAX_NAME_LENGTH),
		assetType: readEnum(input.assetType, "assetType", ASSET_TYPE_BY_INPUT),
		riskCategory: readEnum(input.riskCategory, "riskCategory", RISK_CATEGORY_BY_INPUT),
		segment: readOptionalString(input.segment, "segment", MAX_SEGMENT_LENGTH),
		currency: readCurrency(input.currency),
		exchange: readExchange(input.exchange),
	};
}

export function parseAssetSearchDto(query: unknown): AssetSearchDto {
	const input = readObjectBody(query);
	assertAllowedFields(input, ["ticker", "q", "limit"]);

	return {
		ticker: input.ticker === undefined ? undefined : readTicker(input.ticker),
		q: readOptionalString(input.q, "q", MAX_NAME_LENGTH),
		limit: readSearchLimit(input.limit),
	};
}

export function parseUpsertAssetOverrideDto(body: unknown): UpsertAssetOverrideDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, [
		"customName",
		"customAssetType",
		"customSegment",
		"customRiskCategory",
		"notes",
	]);

	const dto: UpsertAssetOverrideDto = {};

	if (input.customName !== undefined) {
		dto.customName = readNullableString(input.customName, "customName", MAX_NAME_LENGTH);
	}

	if (input.customSegment !== undefined) {
		dto.customSegment = readNullableString(
			input.customSegment,
			"customSegment",
			MAX_SEGMENT_LENGTH,
		);
	}

	if (input.customAssetType !== undefined) {
		dto.customAssetType =
			input.customAssetType === null
				? null
				: readEnum(input.customAssetType, "customAssetType", ASSET_TYPE_BY_INPUT);
	}

	if (input.customRiskCategory !== undefined) {
		dto.customRiskCategory =
			input.customRiskCategory === null
				? null
				: readEnum(input.customRiskCategory, "customRiskCategory", RISK_CATEGORY_BY_INPUT);
	}

	if (input.notes !== undefined) {
		dto.notes = readNullableString(input.notes, "notes", MAX_NOTES_LENGTH);
	}

	if (
		dto.customName === undefined &&
		dto.customAssetType === undefined &&
		dto.customSegment === undefined &&
		dto.customRiskCategory === undefined &&
		dto.notes === undefined
	) {
		throw new BadRequestException("At least one asset override field must be provided");
	}

	return dto;
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
		throw new BadRequestException(`Unknown asset field: ${unknownFields[0]}`);
	}
}

function readRequiredString(value: unknown, field: string, maxLength: number): string {
	if (typeof value !== "string") {
		throw new BadRequestException(`${field} must be a string`);
	}

	const text = value.trim();
	if (!text) {
		throw new BadRequestException(`${field} is required`);
	}

	if (text.length > maxLength) {
		throw new BadRequestException(`${field} must be at most ${maxLength} characters`);
	}

	return text;
}

function readOptionalString(value: unknown, field: string, maxLength: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	return readRequiredString(value, field, maxLength);
}

function readNullableString(value: unknown, field: string, maxLength: number): string | null {
	if (value === null) {
		return null;
	}

	return readRequiredString(value, field, maxLength);
}

function readCurrency(value: unknown): string {
	if (value === undefined) {
		return DEFAULT_CURRENCY;
	}

	const currency = readRequiredString(value, "currency", 3).toUpperCase();
	if (!CURRENCY_CODE_PATTERN.test(currency)) {
		throw new BadRequestException("currency must be a 3-letter currency code");
	}

	return currency;
}

function readTicker(value: unknown): string {
	const ticker = readRequiredString(value, "ticker", MAX_TICKER_LENGTH).toUpperCase();

	if (!TICKER_PATTERN.test(ticker)) {
		throw new BadRequestException("ticker must contain only letters, numbers, or dots");
	}

	return ticker;
}

function readExchange(value: unknown): string {
	if (value === undefined) {
		return DEFAULT_EXCHANGE;
	}

	return readRequiredString(value, "exchange", MAX_EXCHANGE_LENGTH).toUpperCase();
}

function readSearchLimit(value: unknown): number {
	if (value === undefined) {
		return DEFAULT_SEARCH_LIMIT;
	}

	const limit =
		typeof value === "string" && value.trim()
			? Number(value)
			: typeof value === "number"
				? value
				: Number.NaN;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
		throw new BadRequestException(`limit must be an integer from 1 to ${MAX_SEARCH_LIMIT}`);
	}

	return limit;
}

function readEnum<T extends string>(
	value: unknown,
	field: string,
	allowedValues: Map<string, T>,
): T {
	if (typeof value !== "string") {
		throw new BadRequestException(`${field} must be a string`);
	}

	const normalized = value.trim().toUpperCase();
	const enumValue = allowedValues.get(normalized);

	if (!enumValue) {
		throw new BadRequestException(`${field} is not supported`);
	}

	return enumValue;
}

function createEnumMap<T extends string>(values: Record<string, T>): Map<string, T> {
	return new Map(Object.values(values).map((value) => [value.toUpperCase(), value]));
}
