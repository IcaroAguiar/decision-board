import assert from "node:assert/strict";
import test from "node:test";
import {
	BrapiMarketDataProvider,
	brapiMarketDataProviderName,
	ManualMarketDataProvider,
	MarketDataProviderError,
	manualMarketDataProviderName,
} from "./index.js";

test("keeps manual provider available without external configuration", async () => {
	const provider = new ManualMarketDataProvider();

	assert.deepEqual(await provider.getQuotes(["CYCR11"]), []);
});

test("creates manual quote snapshots without external calls", () => {
	const provider = new ManualMarketDataProvider();
	const capturedAt = new Date("2026-05-17T12:00:00.000Z");

	assert.deepEqual(
		provider.createQuoteSnapshot({
			ticker: "CYCR11",
			price: "100.25",
			currency: "BRL",
			capturedAt,
		}),
		{
			ticker: "CYCR11",
			price: "100.25",
			currency: "BRL",
			provider: manualMarketDataProviderName,
			capturedAt,
		},
	);
});

test("maps brapi quote responses into normalized quote snapshots", async () => {
	const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
	const unitTestToken = ["unit", "test", "value"].join("-");
	const provider = new BrapiMarketDataProvider({
		baseUrl: "https://example.test",
		token: unitTestToken,
		now: () => new Date("2026-05-17T12:05:00.000Z"),
		fetch: async (input, init) => {
			requests.push({
				url: input.toString(),
				headers: init?.headers,
			});

			return jsonResponse({
				results: [
					{
						symbol: "petr4",
						regularMarketPrice: 31.1,
						regularMarketTime: "2026-05-17T12:00:00.000Z",
						currency: "BRL",
					},
				],
			});
		},
	});

	assert.deepEqual(await provider.getQuote(" petr4 "), {
		ticker: "PETR4",
		price: "31.1",
		currency: "BRL",
		provider: brapiMarketDataProviderName,
		capturedAt: new Date("2026-05-17T12:00:00.000Z"),
		rawPayload: {
			symbol: "PETR4",
			regularMarketPrice: 31.1,
			regularMarketTime: "2026-05-17T12:00:00.000Z",
			currency: "BRL",
		},
	});
	assert.deepEqual(requests, [
		{
			url: "https://example.test/api/quote/PETR4",
			headers: {
				authorization: `Bearer ${unitTestToken}`,
			},
		},
	]);
});

test("keeps brapi token optional and supports multiple tickers", async () => {
	const requests: string[] = [];
	const provider = new BrapiMarketDataProvider({
		baseUrl: "https://example.test",
		fetch: async (input, init) => {
			assert.equal(init?.headers, undefined);
			requests.push(input.toString());

			return jsonResponse({
				results: [
					{
						symbol: "PETR4",
						regularMarketPrice: 31.1,
						currency: "BRL",
					},
					{
						symbol: "VALE3",
						regularMarketPrice: 62.42,
						currency: "BRL",
					},
				],
			});
		},
		now: () => new Date("2026-05-17T12:10:00.000Z"),
	});

	assert.deepEqual(
		(await provider.getQuotes(["petr4", "vale3"])).map((quote) => ({
			ticker: quote.ticker,
			price: quote.price,
			capturedAt: quote.capturedAt.toISOString(),
		})),
		[
			{
				ticker: "PETR4",
				price: "31.1",
				capturedAt: "2026-05-17T12:10:00.000Z",
			},
			{
				ticker: "VALE3",
				price: "62.42",
				capturedAt: "2026-05-17T12:10:00.000Z",
			},
		],
	);
	assert.deepEqual(requests, ["https://example.test/api/quote/PETR4,VALE3"]);
});

test("turns brapi HTTP and malformed payload failures into provider errors", async () => {
	const failedProvider = new BrapiMarketDataProvider({
		baseUrl: "https://example.test",
		fetch: async () => jsonResponse({ message: "rate limited" }, 429),
	});

	await assert.rejects(
		() => failedProvider.getQuote("PETR4"),
		(error: unknown) =>
			error instanceof MarketDataProviderError &&
			error.code === "BRAPI_REQUEST_FAILED" &&
			error.status === 429,
	);

	const malformedProvider = new BrapiMarketDataProvider({
		baseUrl: "https://example.test",
		fetch: async () =>
			jsonResponse({
				results: [
					{
						symbol: "PETR4",
						regularMarketPrice: 0,
					},
				],
			}),
	});

	await assert.rejects(
		() => malformedProvider.getQuote("PETR4"),
		(error: unknown) =>
			error instanceof MarketDataProviderError && error.code === "BRAPI_INVALID_RESPONSE",
	);
});

test("rejects unsupported tickers before building brapi requests", async () => {
	let requestCount = 0;
	const provider = new BrapiMarketDataProvider({
		baseUrl: "https://example.test",
		fetch: async () => {
			requestCount += 1;
			return jsonResponse({ results: [] });
		},
	});

	await assert.rejects(
		() => provider.getQuote("PETR4,VALE3"),
		(error: unknown) =>
			error instanceof MarketDataProviderError && error.code === "BRAPI_INVALID_TICKER",
	);
	assert.equal(requestCount, 0);
});

test("rejects non-https brapi base URLs except loopback test URLs", () => {
	assert.doesNotThrow(
		() =>
			new BrapiMarketDataProvider({
				baseUrl: "http://127.0.0.1:3000",
			}),
	);
	assert.throws(
		() =>
			new BrapiMarketDataProvider({
				baseUrl: "http://example.test",
			}),
		/baseUrl must use https or loopback http/,
	);
});

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"content-type": "application/json",
		},
	});
}
