import { BadRequestException } from "@nestjs/common";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseReportId(value: string): string {
	if (!UUID_PATTERN.test(value)) {
		throw new BadRequestException("reportId must be a UUID");
	}

	return value;
}
