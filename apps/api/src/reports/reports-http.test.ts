import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { contributionCycleStatuses, strategyIds } from "@decision-board/types";
import {
	clearAuthRateLimits,
	jsonHeaders,
	signUpTestUser,
	type TestUser,
} from "../test/auth-test-user.js";
import { createTestApp, readJson } from "../test/http-test-app.js";

const TEST_EMAIL_PREFIX = "test-reports-";
const CONTENT_TYPE_MARKDOWN_PATTERN = /^text\/markdown/;
const REPORT_JSON_PATH = "current.json";
const REPORT_MARKDOWN_PATH = "current.md";
const httpMethods = {
	post: "POST",
	patch: "PATCH",
} as const;

interface IdPayload {
	id: string;
}

interface TestResources {
	ticker?: string;
	userEmails: string[];
}

interface SavedReportMetadata {
	id: string;
	schemaVersion: string;
	generatedAt: string;
	strategyId: string | null;
	alertCount: number;
	createdAt: string;
}

test("exports sanitized JSON and Markdown reports for the authenticated portfolio", async () => {
	const { app, baseUrl } = await createTestApp();
	const { prisma } = await import("../auth/prisma.client.js");
	const resources: TestResources = {
		userEmails: [],
	};

	await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
	await clearAuthRateLimits(prisma);

	try {
		const owner = await signUpReportUser(baseUrl, "owner", resources);
		const otherUser = await signUpReportUser(baseUrl, "other", resources);
		const portfolio = await createPortfolio(baseUrl, owner);
		const asset = await createAsset(baseUrl, owner, resources);
		await createPosition(baseUrl, owner, portfolio.id, asset.id);
		const cashAccount = await createCashAccount(baseUrl, owner, portfolio.id);
		const contributionPlan = await createContributionPlan(
			baseUrl,
			owner,
			portfolio.id,
			cashAccount.id,
		);
		await createAndConfirmContributionCycle(baseUrl, owner, contributionPlan.id);

		const anonymous = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${REPORT_JSON_PATH}`,
		);
		assert.equal(anonymous.status, 401);

		const invalidPortfolioId = await fetch(
			`${baseUrl}/portfolios/not-a-uuid/reports/${REPORT_JSON_PATH}`,
			{
				headers: jsonHeaders(owner),
			},
		);
		assert.equal(invalidPortfolioId.status, 400);

		const crossUser = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${REPORT_JSON_PATH}`,
			{
				headers: jsonHeaders(otherUser),
			},
		);
		assert.equal(crossUser.status, 404);

		const jsonResponse = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${REPORT_JSON_PATH}`,
			{
				headers: jsonHeaders(owner),
			},
		);
		const report = await readJson(jsonResponse);
		assert.equal(jsonResponse.status, 200, JSON.stringify(report));
		assertReportJson(report, owner, resources.ticker);

		const markdownResponse = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${REPORT_MARKDOWN_PATH}`,
			{
				headers: jsonHeaders(owner),
			},
		);
		const markdown = await markdownResponse.text();
		assert.equal(markdownResponse.status, 200, markdown);
		assert.match(markdownResponse.headers.get("content-type") ?? "", CONTENT_TYPE_MARKDOWN_PATTERN);
		assert.match(markdown, /^# Decision Board Report/m);
		assert.match(markdown, new RegExp(resources.ticker ?? ""));
		assert.equal(markdown.includes(owner.userId), false);
		assert.equal(markdown.includes(owner.email), false);
		assert.equal(markdown.includes("userId"), false);

		const anonymousSave = await fetch(`${baseUrl}/portfolios/${portfolio.id}/reports`, {
			method: httpMethods.post,
		});
		assert.equal(anonymousSave.status, 401);

		const saveResponse = await fetch(`${baseUrl}/portfolios/${portfolio.id}/reports`, {
			method: httpMethods.post,
			headers: jsonHeaders(owner),
		});
		const savedReport = assertSavedReportMetadata(await readJson(saveResponse));
		assert.equal(saveResponse.status, 201);
		assert.equal(savedReport.schemaVersion, "1.0");
		assert.equal(savedReport.strategyId, strategyIds.opportunistic);
		assert.ok(savedReport.alertCount > 0);

		const listResponse = await fetch(`${baseUrl}/portfolios/${portfolio.id}/reports`, {
			headers: jsonHeaders(owner),
		});
		const savedReports = assertSavedReportMetadataList(await readJson(listResponse));
		assert.equal(listResponse.status, 200);
		assert.deepEqual(
			savedReports.map((candidate) => candidate.id),
			[savedReport.id],
		);

		const savedJsonResponse = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${savedReport.id}.json`,
			{
				headers: jsonHeaders(owner),
			},
		);
		const savedJson = await readJson(savedJsonResponse);
		assert.equal(savedJsonResponse.status, 200, JSON.stringify(savedJson));
		assertReportJson(savedJson, owner, resources.ticker);

		const savedMarkdownResponse = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${savedReport.id}.md`,
			{
				headers: jsonHeaders(owner),
			},
		);
		const savedMarkdown = await savedMarkdownResponse.text();
		assert.equal(savedMarkdownResponse.status, 200, savedMarkdown);
		assert.match(savedMarkdown, new RegExp(resources.ticker ?? ""));
		assert.equal(savedMarkdown.includes(owner.userId), false);
		assert.equal(savedMarkdown.includes(owner.email), false);

		const invalidReportId = await fetch(`${baseUrl}/portfolios/${portfolio.id}/reports/nope.json`, {
			headers: jsonHeaders(owner),
		});
		assert.equal(invalidReportId.status, 400);

		const crossUserSavedJson = await fetch(
			`${baseUrl}/portfolios/${portfolio.id}/reports/${savedReport.id}.json`,
			{
				headers: jsonHeaders(otherUser),
			},
		);
		assert.equal(crossUserSavedJson.status, 404);
	} finally {
		await cleanupReportData(prisma, resources);
		await app.close();
		await prisma.$disconnect();
	}
});

async function signUpReportUser(
	baseUrl: string,
	label: string,
	resources: TestResources,
): Promise<TestUser> {
	const user = await signUpTestUser(baseUrl, `reports-${label}`);
	resources.userEmails.push(user.email);
	return user;
}

async function createPortfolio(baseUrl: string, user: TestUser): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			name: "Synthetic report portfolio",
			baseCurrency: "brl",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createAsset(
	baseUrl: string,
	user: TestUser,
	resources: TestResources,
): Promise<IdPayload> {
	const ticker = `RPT${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
	resources.ticker = ticker;

	const response = await fetch(`${baseUrl}/assets`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			ticker,
			name: "Synthetic Report Asset",
			assetType: "fii",
			riskCategory: "paper",
			segment: "receivables",
			currency: "brl",
			exchange: "B3",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createPosition(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	assetId: string,
): Promise<void> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/positions`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			assetId,
			quantity: "12.5",
			averagePrice: "90",
			manualCurrentPrice: "100.20",
			notes: "synthetic report position",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
}

async function createCashAccount(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/cash-accounts`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			name: "Synthetic reserve",
			type: "CDB",
			balance: "1500.50",
			liquidity: "D+0",
			benchmark: "CDI",
			benchmarkPercent: "100",
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createContributionPlan(
	baseUrl: string,
	user: TestUser,
	portfolioId: string,
	cashAccountId: string,
): Promise<IdPayload> {
	const response = await fetch(`${baseUrl}/portfolios/${portfolioId}/contribution-plans`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			amount: "1000",
			frequency: "monthly",
			dayOfMonth: 10,
			startsAt: "2099-01-01",
			defaultStrategyId: strategyIds.balancedGrowth,
			cashAccountId,
		}),
	});
	const payload = await readJson(response);
	assert.equal(response.status, 201, JSON.stringify(payload));
	return assertIdPayload(payload);
}

async function createAndConfirmContributionCycle(
	baseUrl: string,
	user: TestUser,
	contributionPlanId: string,
): Promise<void> {
	const createResponse = await fetch(`${baseUrl}/contribution-plans/${contributionPlanId}/cycles`, {
		method: httpMethods.post,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			cycleMonth: "2099-05",
		}),
	});
	const createPayload = await readJson(createResponse);
	assert.equal(createResponse.status, 201, JSON.stringify(createPayload));
	const cycle = assertIdPayload(createPayload);

	const confirmResponse = await fetch(`${baseUrl}/contribution-cycles/${cycle.id}`, {
		method: httpMethods.patch,
		headers: jsonHeaders(user),
		body: JSON.stringify({
			status: contributionCycleStatuses.confirmed,
			confirmedAmount: "1200",
			strategyId: strategyIds.opportunistic,
			notes: "synthetic report confirmation",
		}),
	});
	const confirmPayload = await readJson(confirmResponse);
	assert.equal(confirmResponse.status, 200, JSON.stringify(confirmPayload));
}

function assertReportJson(payload: unknown, owner: TestUser, ticker: string | undefined): void {
	assert.ok(isRecord(payload));
	assert.equal(payload.schemaVersion, "1.0");
	assert.ok(isRecord(payload.portfolio));
	assert.equal(payload.portfolio.name, "Synthetic report portfolio");
	assert.equal(payload.portfolio.totalValue, 2753);
	assert.equal(payload.portfolio.positionCount, 1);
	assert.equal(payload.portfolio.pricedPositionCount, 1);
	assert.ok(isRecord(payload.strategy));
	assert.equal(payload.strategy.id, strategyIds.opportunistic);
	assert.ok(Array.isArray(payload.positions));
	assert.equal(payload.positions.length, 1);
	assert.ok(isRecord(payload.positions[0]));
	assert.equal(payload.positions[0].ticker, ticker);
	assert.equal(payload.positions[0].totalValue, 1252.5);
	assert.equal("assetId" in payload.positions[0], false);
	assert.ok(isRecord(payload.allocation));
	assert.ok(Array.isArray(payload.allocation.byAsset));
	assert.ok(isRecord(payload.allocation.byAsset[0]));
	assert.equal("assetId" in payload.allocation.byAsset[0], false);
	assert.ok(Array.isArray(payload.alerts));

	const serialized = JSON.stringify(payload);
	assert.equal(serialized.includes(owner.userId), false);
	assert.equal(serialized.includes(owner.email), false);
	assert.equal(serialized.includes("userId"), false);
	assert.equal(serialized.includes("email"), false);
	assert.equal(serialized.includes("session"), false);
	assert.equal(serialized.includes("token"), false);
}

function assertSavedReportMetadata(payload: unknown): SavedReportMetadata {
	assert.ok(isRecord(payload));
	const metadata = {
		id: readStringField(payload, "id"),
		schemaVersion: readStringField(payload, "schemaVersion"),
		generatedAt: readStringField(payload, "generatedAt"),
		strategyId: readNullableStringField(payload, "strategyId"),
		alertCount: readNumberField(payload, "alertCount"),
		createdAt: readStringField(payload, "createdAt"),
	};
	assert.equal("userId" in payload, false);
	assert.equal("json" in payload, false);
	assert.equal("markdown" in payload, false);

	return metadata;
}

function assertSavedReportMetadataList(payload: unknown): SavedReportMetadata[] {
	assert.ok(Array.isArray(payload));
	return payload.map(assertSavedReportMetadata);
}

async function cleanupReportData(
	prisma: {
		user: {
			deleteMany(args: {
				where: { email: { in?: string[]; startsWith?: string } };
			}): Promise<unknown>;
		};
		asset: { deleteMany(args: { where: { ticker?: string } }): Promise<unknown> };
		rateLimit: {
			deleteMany(args: { where: { key: { contains: string } } }): Promise<unknown>;
		};
	},
	resources: TestResources,
): Promise<void> {
	await prisma.user.deleteMany({
		where: resources.userEmails.length
			? { email: { in: resources.userEmails } }
			: { email: { startsWith: TEST_EMAIL_PREFIX } },
	});

	if (resources.ticker) {
		await prisma.asset.deleteMany({ where: { ticker: resources.ticker } });
	}

	await clearAuthRateLimits(prisma);
}

function assertIdPayload(payload: unknown): IdPayload {
	assert.ok(isRecord(payload));
	const id = payload.id;
	if (typeof id !== "string") {
		assert.fail("id must be a string");
	}
	assert.equal("userId" in payload, false);
	return { id };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

function readStringField(payload: Record<string, unknown>, field: string): string {
	const value = payload[field];
	if (typeof value !== "string") {
		assert.fail(`${field} must be a string`);
	}

	return value;
}

function readNullableStringField(payload: Record<string, unknown>, field: string): string | null {
	const value = payload[field];
	if (value === null) {
		return null;
	}

	if (typeof value !== "string") {
		assert.fail(`${field} must be a string or null`);
	}

	return value;
}

function readNumberField(payload: Record<string, unknown>, field: string): number {
	const value = payload[field];
	if (typeof value !== "number") {
		assert.fail(`${field} must be a number`);
	}

	return value;
}
