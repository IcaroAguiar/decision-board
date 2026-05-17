import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyReportEnvelope, generateMarkdownReport } from "./index.js";

test("creates a versioned MVP report envelope", () => {
	const report = createEmptyReportEnvelope("2026-05-12T00:00:00.000Z");

	assert.equal(report.schemaVersion, "1.0");
	assert.deepEqual(report.contribution, {});
	assert.deepEqual(report.positions, []);
});

test("renders empty report sections explicitly", () => {
	const markdown = generateMarkdownReport(createEmptyReportEnvelope("2026-05-17T12:00:00.000Z"));

	assert.match(markdown, /## Contribution\n\nNo data\./);
	assert.match(markdown, /## Positions\n\nNo items\./);
	assert.match(markdown, /## Alerts\n\nNo items\./);
	assert.match(markdown, /## User Notes\n\nNo notes\./);
});

test("generates deterministic markdown from the report envelope", () => {
	const markdown = generateMarkdownReport({
		schemaVersion: "1.0",
		generatedAt: "2026-05-17T12:00:00.000Z",
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
		generatedAt: "2026-05-17T12:00:00.000Z",
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
