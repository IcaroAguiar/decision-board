export interface ReportEnvelope {
	schemaVersion: "1.0";
	generatedAt: string;
	strategy: Record<string, unknown>;
	contribution: Record<string, unknown>;
	cash: Record<string, unknown>;
	portfolio: Record<string, unknown>;
	positions: unknown[];
	allocation: Record<string, unknown>;
	alerts: unknown[];
	reviewPolicy: Record<string, unknown>;
	userNotes: string[];
}

const SENSITIVE_FIELD_PATTERNS = [
	"accesstoken",
	"authpayload",
	"cookie",
	"cpf",
	"email",
	"password",
	"refreshtoken",
	"resettoken",
	"secret",
	"session",
	"sessionid",
	"token",
	"userid",
] as const;
const EMPTY_SCALAR_LABEL = "N/A";

export function createEmptyReportEnvelope(generatedAt = new Date().toISOString()): ReportEnvelope {
	return {
		schemaVersion: "1.0",
		generatedAt,
		strategy: {},
		contribution: {},
		cash: {},
		portfolio: {},
		positions: [],
		allocation: {},
		alerts: [],
		reviewPolicy: {},
		userNotes: [],
	};
}

export function generateMarkdownReport(report: ReportEnvelope): string {
	return `${[
		"# Decision Board Report",
		"",
		`Generated at: ${formatScalar(report.generatedAt)}`,
		`Schema version: ${report.schemaVersion}`,
	].join("\n")}\n\n${[
		formatSection("Portfolio", report.portfolio),
		formatSection("Strategy", report.strategy),
		formatSection("Contribution", report.contribution),
		formatSection("Cash", report.cash),
		formatListSection("Positions", report.positions),
		formatSection("Allocation", report.allocation),
		formatListSection("Alerts", report.alerts),
		formatSection("Review Policy", report.reviewPolicy),
		formatNotes(report.userNotes),
	].join("\n\n")}\n`;
}

function formatSection(title: string, value: Record<string, unknown>): string {
	const entries = Object.entries(value)
		.filter(([key]) => !isSensitiveField(key))
		.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

	return [
		`## ${title}`,
		"",
		entries.length === 0 ? "No data." : entries.map(formatEntry).join("\n"),
	].join("\n");
}

function formatListSection(title: string, items: unknown[]): string {
	if (items.length === 0) {
		return [`## ${title}`, "", "No items."].join("\n");
	}

	return [
		`## ${title}`,
		"",
		items.map((item, index) => `${index + 1}. ${formatValue(item)}`).join("\n"),
	].join("\n");
}

function formatNotes(notes: string[]): string {
	if (notes.length === 0) {
		return ["## User Notes", "", "No notes."].join("\n");
	}

	return ["## User Notes", "", notes.map((note) => `- ${formatScalar(note)}`).join("\n")].join(
		"\n",
	);
}

function formatEntry([key, value]: [string, unknown]): string {
	return `- ${key}: ${formatValue(value)}`;
}

function formatValue(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map(formatValue).join(", ");
	}

	if (isPlainRecord(value)) {
		const entries = Object.entries(value)
			.filter(([key]) => !isSensitiveField(key))
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

		if (entries.length === 0) {
			return "No data";
		}

		return entries.map(([key, entryValue]) => `${key}: ${formatValue(entryValue)}`).join("; ");
	}

	return formatScalar(value);
}

function formatScalar(value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return EMPTY_SCALAR_LABEL;
	}

	return String(value).replace(/\s+/g, " ").trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveField(key: string): boolean {
	const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();

	return SENSITIVE_FIELD_PATTERNS.some((pattern) => normalizedKey.includes(pattern));
}
