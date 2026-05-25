import { BadRequestException } from "@nestjs/common";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateSavedReportDto {
	contributionCycleId?: string;
}

export function parseCreateSavedReportDto(body: unknown): CreateSavedReportDto {
	if (body === undefined || body === null || body === "") {
		return {};
	}

	if (typeof body !== "object" || Array.isArray(body)) {
		throw new BadRequestException("Request body must be an object");
	}

	const input = body as Record<string, unknown>;
	assertAllowedFields(input, ["contributionCycleId"]);

	if (input.contributionCycleId === undefined || input.contributionCycleId === null) {
		return {};
	}

	if (typeof input.contributionCycleId !== "string") {
		throw new BadRequestException("contributionCycleId must be a UUID");
	}

	return {
		contributionCycleId: parseContributionCycleId(input.contributionCycleId),
	};
}

export function parseReportId(value: string): string {
	if (!UUID_PATTERN.test(value)) {
		throw new BadRequestException("reportId must be a UUID");
	}

	return value;
}

function parseContributionCycleId(value: string): string {
	if (!UUID_PATTERN.test(value)) {
		throw new BadRequestException("contributionCycleId must be a UUID");
	}

	return value;
}

function assertAllowedFields(input: Record<string, unknown>, allowedFields: string[]): void {
	const allowed = new Set(allowedFields);
	const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));

	if (unknownFields.length > 0) {
		throw new BadRequestException(`Unknown report field: ${unknownFields[0]}`);
	}
}
