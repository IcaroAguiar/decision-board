import assert from "node:assert/strict";
import test from "node:test";
import { fallbackApiBase, loadStates, normalizeApiBase } from "./monthly-contribution.js";
import { nextBusyLoadState, resolveListedPortfolioId } from "./proof-load-state.js";

test("nextBusyLoadState keeps error until a later success path", () => {
	assert.equal(nextBusyLoadState(loadStates.ready, true), loadStates.loading);
	assert.equal(nextBusyLoadState(loadStates.error, false), loadStates.error);
	assert.equal(nextBusyLoadState(loadStates.loading, false), loadStates.ready);
});

test("normalizeApiBase defaults empty values to localhost API", () => {
	assert.equal(normalizeApiBase("https://api.example.test/"), "https://api.example.test");
	assert.equal(normalizeApiBase("   "), fallbackApiBase);
});

test("resolveListedPortfolioId prefers the requested id", () => {
	const listed = [{ id: "a" }, { id: "b" }];
	assert.equal(resolveListedPortfolioId(listed, "b"), "b");
	assert.equal(resolveListedPortfolioId(listed, "missing"), "a");
	assert.equal(resolveListedPortfolioId([], "b"), undefined);
});
