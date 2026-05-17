import assert from "node:assert/strict";
import test from "node:test";
import {
	createEmptyReportEnvelope,
	generateJsonReport,
	generateMarkdownReport,
	REPORT_JSON_SCHEMA,
	REPORT_SCHEMA_VERSION,
	validateJsonReport,
} from "./index.js";

const REPORT_TEST_GENERATED_AT = "2026-05-17T12:00:00.000Z";

test("creates a versioned MVP report envelope", () => {
	const report = createEmptyReportEnvelope("2026-05-12T00:00:00.000Z");

	assert.equal(report.schemaVersion, "1.0");
	assert.deepEqual(report.contribution, {});
	assert.deepEqual(report.positions, []);
});

test("exposes the MVP JSON schema contract", () => {
	assert.equal(REPORT_SCHEMA_VERSION, "1.0");
	assert.deepEqual(REPORT_JSON_SCHEMA.required, [
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
	]);
	assert.equal(REPORT_JSON_SCHEMA.properties.schemaVersion.const, REPORT_SCHEMA_VERSION);
});

test("renders empty report sections explicitly", () => {
	const markdown = generateMarkdownReport(createEmptyReportEnvelope(REPORT_TEST_GENERATED_AT));

	assert.match(markdown, /## Contribution\n\nNo data\./);
	assert.match(markdown, /## Positions\n\nNo items\./);
	assert.match(markdown, /## Alerts\n\nNo items\./);
	assert.match(markdown, /## User Notes\n\nNo notes\./);
});

test("generates deterministic markdown from the report envelope", () => {
	const markdown = generateMarkdownReport({
		schemaVersion: "1.0",
		generatedAt: REPORT_TEST_GENERATED_AT,
		portfolio: {
			name: "Carteira principal",
			baseCurrency: "BRL",
		},
		strategy: {
			name: "Defensiva",
			reportIntervalDays: 30,
		},
		contribution: {
			plannedAmount: "500",
			cycleMonth: "2026-05",
		},
		cash: {
			total: "1000.50",
		},
		positions: [
			{
				ticker: "ABCD11",
				quantity: "10",
				totalValue: "1050",
			},
		],
		allocation: {
			cashPercent: "48.79",
			positionsPercent: "51.21",
		},
		alerts: [
			{
				severity: "warning",
				message: "Review required",
			},
		],
		reviewPolicy: {
			nextReviewInDays: 30,
		},
		userNotes: ["Manter revisão manual antes de novos aportes."],
	});

	assert.equal(
		markdown,
		`# Decision Board Report

Generated at: 2026-05-17T12:00:00.000Z
Schema version: 1.0

## Portfolio

- baseCurrency: BRL
- name: Carteira principal

## Strategy

- name: Defensiva
- reportIntervalDays: 30

## Contribution

- cycleMonth: 2026-05
- plannedAmount: 500

## Cash

- total: 1000.50

## Positions

1. quantity: 10; ticker: ABCD11; totalValue: 1050

## Allocation

- cashPercent: 48.79
- positionsPercent: 51.21

## Alerts

1. message: Review required; severity: warning

## Review Policy

- nextReviewInDays: 30

## User Notes

- Manter revisão manual antes de novos aportes.
`,
	);
});

test("omits sensitive fields from markdown output", () => {
	const markdown = generateMarkdownReport({
		schemaVersion: "1.0",
		generatedAt: REPORT_TEST_GENERATED_AT,
		portfolio: {
			email: "synthetic@example.test",
			name: "Carteira principal",
			userId: "00000000-0000-4000-8000-000000000001",
		},
		strategy: {},
		contribution: {},
		cash: {},
		positions: [
			{
				cookieHeader: "redaction-cookie",
				cpfNumber: "redaction-cpf",
				emailAddress: "redaction-email",
				idToken: "redaction-id",
				rawAuthPayload: "redaction-auth",
				sessionId: "synthetic-session",
				sessionToken: "redaction-session",
				ticker: "ABCD11",
			},
		],
		allocation: {},
		alerts: [],
		reviewPolicy: {},
		userNotes: [],
	});

	assert.match(markdown, /Carteira principal/);
	assert.doesNotMatch(markdown, /synthetic@example\.test/);
	assert.doesNotMatch(markdown, /00000000-0000-4000-8000-000000000001/);
	assert.doesNotMatch(markdown, /synthetic-session/);
	assert.doesNotMatch(markdown, /redaction-/);
});

test("generates deterministic sanitized JSON from the report envelope", () => {
	const generatedAt = "2026-05-17T12:00:00.000Z";
	const capturedAt = new Date("2026-05-17T12:30:00.000Z");
	const report = generateJsonReport({
		schemaVersion: "1.0",
		generatedAt,
		portfolio: {
			name: " Carteira principal ",
			baseCurrency: "BRL",
			userId: "00000000-0000-4000-8000-000000000001",
		},
		strategy: {
			name: "Defensiva",
		},
		contribution: {
			plannedAmount: "500",
		},
		cash: {
			total: "1000.50",
		},
		positions: [
			{
				ticker: "ABCD11",
				capturedAt,
				settledAt: new Date("invalid"),
				sessionToken: "redaction-session",
				notes: "",
			},
		],
		allocation: {
			positionsPercent: "51.21",
			cashPercent: "48.79",
		},
		alerts: [
			{
				message: "Review required",
				rawAuthPayload: "redaction-auth",
				score: Number.NaN,
			},
		],
		reviewPolicy: {
			nextReviewInDays: 30,
		},
		userNotes: ["  Manter revisão manual.  "],
	});

	assert.notEqual(report.portfolio, undefined);
	assert.equal(report.schemaVersion, "1.0");
	assert.equal(report.generatedAt, generatedAt);
	assert.deepEqual(Object.keys(report.portfolio), ["baseCurrency", "name"]);
	assert.deepEqual(report.portfolio, {
		baseCurrency: "BRL",
		name: "Carteira principal",
	});
	assert.deepEqual(Object.keys(report.allocation), ["cashPercent", "positionsPercent"]);
	assert.deepEqual(report.positions, [
		{
			capturedAt: "2026-05-17T12:30:00.000Z",
			notes: null,
			settledAt: null,
			ticker: "ABCD11",
		},
	]);
	assert.deepEqual(report.alerts, [
		{
			message: "Review required",
			score: null,
		},
	]);
	assert.deepEqual(report.userNotes, ["Manter revisão manual."]);
	assert.equal(validateJsonReport(report), true);
	assert.doesNotMatch(JSON.stringify(report), /redaction-|00000000-0000-4000-8000-000000000001/);
});

test("validates the JSON report envelope shape", () => {
	assert.equal(validateJsonReport(createEmptyReportEnvelope(REPORT_TEST_GENERATED_AT)), true);
	assert.equal(
		validateJsonReport({
			...createEmptyReportEnvelope(REPORT_TEST_GENERATED_AT),
			schemaVersion: "0.9",
		}),
		false,
	);
	assert.equal(
		validateJsonReport({
			...createEmptyReportEnvelope(REPORT_TEST_GENERATED_AT),
			userNotes: [123],
		}),
		false,
	);
	assert.equal(validateJsonReport(null), false);
});
