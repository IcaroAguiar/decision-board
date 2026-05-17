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

type JsonReportValue = string | number | boolean | null | JsonReportValue[] | JsonReportRecord;
type JsonReportRecord = { [key: string]: JsonReportValue };

export const REPORT_SCHEMA_VERSION = "1.0";
const JSON_SCHEMA_OBJECT_TYPE = "object";
const JSON_SCHEMA_STRING_TYPE = "string";
export const REPORT_JSON_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	title: "Decision Board Report",
	type: JSON_SCHEMA_OBJECT_TYPE,
	additionalProperties: false,
	required: [
		"schemaVersion",
		"generatedAt",
		"strategy",
		"contribution",
		"cash",
		"portfolio",
		"positions",
		"allocation",
		"alerts",
		"reviewPolicy",
		"userNotes",
	],
	properties: {
		schemaVersion: { const: REPORT_SCHEMA_VERSION },
		generatedAt: { type: JSON_SCHEMA_STRING_TYPE },
		strategy: { type: JSON_SCHEMA_OBJECT_TYPE },
		contribution: { type: JSON_SCHEMA_OBJECT_TYPE },
		cash: { type: JSON_SCHEMA_OBJECT_TYPE },
		portfolio: { type: JSON_SCHEMA_OBJECT_TYPE },
		positions: { type: "array" },
		allocation: { type: JSON_SCHEMA_OBJECT_TYPE },
		alerts: { type: "array" },
		reviewPolicy: { type: JSON_SCHEMA_OBJECT_TYPE },
		userNotes: {
			type: "array",
			items: { type: JSON_SCHEMA_STRING_TYPE },
		},
	},
} as const;

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
		schemaVersion: REPORT_SCHEMA_VERSION,
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
	const sanitizedReport = generateJsonReport(report);

	return `${[
		"# Decision Board Report",
		"",
		`Generated at: ${formatScalar(sanitizedReport.generatedAt)}`,
		`Schema version: ${sanitizedReport.schemaVersion}`,
	].join("\n")}\n\n${[
		formatSection("Portfolio", sanitizedReport.portfolio),
		formatSection("Strategy", sanitizedReport.strategy),
		formatSection("Contribution", sanitizedReport.contribution),
		formatSection("Cash", sanitizedReport.cash),
		formatListSection("Positions", sanitizedReport.positions),
		formatSection("Allocation", sanitizedReport.allocation),
		formatListSection("Alerts", sanitizedReport.alerts),
		formatSection("Review Policy", sanitizedReport.reviewPolicy),
		formatNotes(sanitizedReport.userNotes),
	].join("\n\n")}\n`;
}

export function generateJsonReport(report: ReportEnvelope): ReportEnvelope {
	return {
		schemaVersion: REPORT_SCHEMA_VERSION,
		generatedAt: formatScalar(report.generatedAt),
		strategy: sanitizeRecord(report.strategy),
		contribution: sanitizeRecord(report.contribution),
		cash: sanitizeRecord(report.cash),
		portfolio: sanitizeRecord(report.portfolio),
		positions: report.positions.map(sanitizeValue),
		allocation: sanitizeRecord(report.allocation),
		alerts: report.alerts.map(sanitizeValue),
		reviewPolicy: sanitizeRecord(report.reviewPolicy),
		userNotes: report.userNotes.map(formatScalar),
	};
}

export function validateJsonReport(value: unknown): value is ReportEnvelope {
	if (!isPlainRecord(value)) {
		return false;
	}

	return (
		value.schemaVersion === REPORT_SCHEMA_VERSION &&
		typeof value.generatedAt === "string" &&
		isPlainRecord(value.strategy) &&
		isPlainRecord(value.contribution) &&
		isPlainRecord(value.cash) &&
		isPlainRecord(value.portfolio) &&
		Array.isArray(value.positions) &&
		isPlainRecord(value.allocation) &&
		Array.isArray(value.alerts) &&
		isPlainRecord(value.reviewPolicy) &&
		Array.isArray(value.userNotes) &&
		value.userNotes.every((note) => typeof note === "string")
	);
}

function formatSection(title: string, value: Record<string, unknown>): string {
	const entries = Object.entries(value);

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
		const entries = Object.entries(value);

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

function sanitizeRecord(value: Record<string, unknown>): JsonReportRecord {
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !isSensitiveField(key))
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([key, recordValue]) => [key, sanitizeValue(recordValue)]),
	);
}

function sanitizeValue(value: unknown): JsonReportValue {
	if (Array.isArray(value)) {
		return value.map(sanitizeValue);
	}

	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value.toISOString() : null;
	}

	if (isPlainRecord(value)) {
		return sanitizeRecord(value);
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === "boolean" || value === null) {
		return value;
	}

	return sanitizeScalar(value);
}

function sanitizeScalar(value: unknown): string | null {
	if (value === undefined || value === "") {
		return null;
	}

	return String(value).replace(/\s+/g, " ").trim();
}

function isSensitiveField(key: string): boolean {
	const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();

	return SENSITIVE_FIELD_PATTERNS.some((pattern) => normalizedKey.includes(pattern));
}
