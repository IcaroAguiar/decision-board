import assert from "node:assert/strict";
import test from "node:test";
import { ManualMarketDataProvider, manualMarketDataProviderName } from "./index.js";

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
