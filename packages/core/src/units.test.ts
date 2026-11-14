import assert from "node:assert/strict";
import test from "node:test";
import { approxEqual, portfolioParts } from "./index.js";

test("uses shared portfolio parts and decimal comparison tolerances", () => {
	assert.deepEqual(portfolioParts, ["reserve", "goal", "variableIncome"]);
	assert.equal(approxEqual(1, 1 + 0.5e-12), true);
	assert.equal(approxEqual(1, 1 + 2e-12), false);
	assert.equal(approxEqual(0, 0.125, { absolute: 0.125, relative: 0 }), true);
	assert.equal(approxEqual(0, 0.125, { absolute: 0.124, relative: 0 }), false);
	assert.equal(approxEqual(1, 2, { relative: 0.5 }), true);
	assert.equal(approxEqual(1, 2, { relative: 0.499 }), false);
	assert.equal(approxEqual(0, 0), true);
	assert.equal(approxEqual(0, 1e-15), false);
	assert.equal(approxEqual(Number.NaN, 1), false);
	assert.equal(approxEqual(Infinity, Infinity), false);
	assert.throws(() => approxEqual(1, 1, { relative: -1 }), /tolerâncias/);
});
