import { BadRequestException } from "@nestjs/common";

export interface CreatePortfolioDto {
	name: string;
	baseCurrency: string;
}

export interface UpdatePortfolioDto {
	name?: string;
	baseCurrency?: string;
}

const DEFAULT_BASE_CURRENCY = "BRL";
const MAX_PORTFOLIO_NAME_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function parsePortfolioId(value: string): string {
	if (!UUID_PATTERN.test(value)) {
		throw new BadRequestException("portfolioId must be a UUID");
	}

	return value;
}

export function parseCreatePortfolioDto(body: unknown): CreatePortfolioDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, ["name", "baseCurrency"]);

	return {
		name: readRequiredName(input.name),
		baseCurrency: readBaseCurrency(input.baseCurrency) ?? DEFAULT_BASE_CURRENCY,
	};
}

export function parseUpdatePortfolioDto(body: unknown): UpdatePortfolioDto {
	const input = readObjectBody(body);
	assertAllowedFields(input, ["name", "baseCurrency"]);

	const dto: UpdatePortfolioDto = {};

	if (input.name !== undefined) {
		dto.name = readRequiredName(input.name);
	}

	if (input.baseCurrency !== undefined) {
		dto.baseCurrency = readRequiredBaseCurrency(input.baseCurrency);
	}

	if (dto.name === undefined && dto.baseCurrency === undefined) {
		throw new BadRequestException("At least one portfolio field must be provided");
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
		throw new BadRequestException(`Unknown portfolio field: ${unknownFields[0]}`);
	}
}

function readRequiredName(value: unknown): string {
	if (typeof value !== "string") {
		throw new BadRequestException("name must be a string");
	}

	const name = value.trim();
	if (!name) {
		throw new BadRequestException("name is required");
	}

	if (name.length > MAX_PORTFOLIO_NAME_LENGTH) {
		throw new BadRequestException(`name must be at most ${MAX_PORTFOLIO_NAME_LENGTH} characters`);
	}

	return name;
}

function readBaseCurrency(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	return readRequiredBaseCurrency(value);
}

function readRequiredBaseCurrency(value: unknown): string {
	if (typeof value !== "string") {
		throw new BadRequestException("baseCurrency must be a string");
	}

	const currency = value.trim().toUpperCase();
	if (!CURRENCY_CODE_PATTERN.test(currency)) {
		throw new BadRequestException("baseCurrency must be a 3-letter currency code");
	}

	return currency;
}
