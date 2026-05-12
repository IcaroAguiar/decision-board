export interface ReportEnvelope {
	schemaVersion: "1.0";
	generatedAt: string;
	strategy: Record<string, unknown>;
	cash: Record<string, unknown>;
	portfolio: Record<string, unknown>;
	positions: unknown[];
	allocation: Record<string, unknown>;
	alerts: unknown[];
	reviewPolicy: Record<string, unknown>;
	userNotes: string[];
}

export function createEmptyReportEnvelope(generatedAt = new Date().toISOString()): ReportEnvelope {
	return {
		schemaVersion: "1.0",
		generatedAt,
		strategy: {},
		cash: {},
		portfolio: {},
		positions: [],
		allocation: {},
		alerts: [],
		reviewPolicy: {},
		userNotes: [],
	};
}
