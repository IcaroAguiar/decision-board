import assert from "node:assert/strict";
import test from "node:test";
import { assessFreshness, known, missing, type SourceRef, sumWithCoverage } from "./index.js";

const source: SourceRef = {
	id: "synthetic-source",
	label: "Fonte sintética",
	asOf: "2026-03-02",
	official: false,
};

test("constructs data with nature and source and rejects invalid dates or empty reasons", () => {
	assert.deepEqual(known(2, "informed", source), {
		status: "known",
		value: 2,
		nature: "informed",
		source,
	});
	assert.deepEqual(missing("Sem dado sintético"), {
		status: "missing",
		reason: "Sem dado sintético",
	});
	assert.throws(() => known(2, "observed", { ...source, asOf: "2026-02-30" }), /Data inválida/);
	assert.throws(() => missing(" \t"), /motivo/);
});

test("sums all known parts with complete coverage", () => {
	assert.deepEqual(sumWithCoverage([known(2, "informed", source), known(3, "estimated", source)]), {
		total: 5,
		coverage: "complete",
		knownCount: 2,
		missingCount: 0,
		missingReasons: [],
	});
});

test("sums only known parts and explains partial coverage", () => {
	assert.deepEqual(
		sumWithCoverage([
			known(2, "observed", source),
			missing("Fonte ausente"),
			known(3, "informed", source),
		]),
		{
			total: 5,
			coverage: "partial",
			knownCount: 2,
			missingCount: 1,
			missingReasons: ["Fonte ausente"],
		},
	);
});

test("reports empty coverage when every part is missing or there are no parts", () => {
	assert.deepEqual(sumWithCoverage([missing("Sem A"), missing("Sem B")]), {
		total: 0,
		coverage: "empty",
		knownCount: 0,
		missingCount: 2,
		missingReasons: ["Sem A", "Sem B"],
	});
	assert.deepEqual(sumWithCoverage([]), {
		total: 0,
		coverage: "empty",
		knownCount: 0,
		missingCount: 0,
		missingReasons: [],
	});
});

test("preserves known zero and negative values without rounding float64 sums", () => {
	assert.deepEqual(sumWithCoverage([known(0, "informed", source)]), {
		total: 0,
		coverage: "complete",
		knownCount: 1,
		missingCount: 0,
		missingReasons: [],
	});
	assert.equal(
		sumWithCoverage([known(-2, "informed", source), known(3, "informed", source)]).total,
		1,
	);
	assert.ok(
		Math.abs(
			sumWithCoverage([known(0.1, "informed", source), known(0.2, "informed", source)]).total - 0.3,
		) <= 0.3e-12,
	);
});

test("rejects non-finite known numbers and sum overflow", () => {
	for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
		assert.throws(() => sumWithCoverage([known(value, "observed", source)]), /finito/);
	}
	assert.throws(
		() =>
			sumWithCoverage([
				known(Number.MAX_VALUE, "observed", source),
				known(Number.MAX_VALUE, "observed", source),
			]),
		/finito/,
	);
});

test("freshness includes the maximum age and turns stale one day later", () => {
	assert.deepEqual(assessFreshness(known(2, "observed", source), "2026-03-05", 3), {
		state: "fresh",
		ageDays: 3,
	});
	assert.deepEqual(assessFreshness(known(2, "observed", source), "2026-03-06", 3), {
		state: "stale",
		ageDays: 4,
	});
	assert.deepEqual(assessFreshness(known(2, "observed", source), "2026-03-02", 0), {
		state: "fresh",
		ageDays: 0,
	});
	assert.deepEqual(assessFreshness(missing("Sem fonte"), "2026-03-05", 3), {
		state: "missing",
		ageDays: null,
	});
});

test("rejects future sources, invalid asOf and invalid age limits", () => {
	assert.throws(() => assessFreshness(known(2, "observed", source), "2026-03-01", 3), /anterior/);
	assert.throws(() => assessFreshness(missing("Sem fonte"), "2026-02-30", 3), /Data inválida/);
	for (const age of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => assessFreshness(missing("Sem fonte"), "2026-03-02", age), /idade máxima/);
	}
});
