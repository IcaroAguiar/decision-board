import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyReportEnvelope } from "./index.js";

test("creates a versioned MVP report envelope", () => {
	const report = createEmptyReportEnvelope("2026-05-12T00:00:00.000Z");

	assert.equal(report.schemaVersion, "1.0");
	assert.deepEqual(report.positions, []);
});
