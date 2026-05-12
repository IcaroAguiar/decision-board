import assert from "node:assert/strict";
import test from "node:test";
import { getStrategyById, strategies } from "./index.js";

test("defines the five MVP strategies", () => {
	assert.equal(strategies.length, 5);
});

test("looks up low maintenance strategy metadata", () => {
	assert.equal(getStrategyById("low_maintenance").reportIntervalDays, 30);
});
