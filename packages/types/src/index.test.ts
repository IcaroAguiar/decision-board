import assert from "node:assert/strict";
import test from "node:test";
import type { CurrencyCode } from "./index.js";

test("keeps BRL as the default MVP currency type", () => {
	const currency: CurrencyCode = "BRL";

	assert.equal(currency, "BRL");
});
