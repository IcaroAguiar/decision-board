import assert from "node:assert/strict";
import test from "node:test";
import { ManualMarketDataProvider } from "./index.js";

test("keeps manual provider available without external configuration", async () => {
	const provider = new ManualMarketDataProvider();

	assert.deepEqual(await provider.getQuotes(["CYCR11"]), []);
});
