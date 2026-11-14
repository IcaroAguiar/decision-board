import assert from "node:assert/strict";
import test from "node:test";
import {
	approxEqual,
	assessFreshness,
	collectEvidence,
	known,
	missing,
	type SourceRef,
	sumWithCoverage,
	weightsWithCoverage,
} from "./index.js";

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
		total: null,
		coverage: "empty",
		knownCount: 0,
		missingCount: 2,
		missingReasons: ["Sem A", "Sem B"],
	});
	assert.deepEqual(sumWithCoverage([]), {
		total: null,
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
	const decimalSum = sumWithCoverage([
		known(0.1, "informed", source),
		known(0.2, "informed", source),
	]);
	if (decimalSum.coverage === "empty") assert.fail("A soma deve ter valores conhecidos.");
	assert.ok(approxEqual(decimalSum.total, 0.3));
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

test("collects deduplicated sources and reasons with non-official disclosure", () => {
	const official = { ...source, id: "official", official: true };
	assert.deepEqual(
		collectEvidence([
			known(1, "observed", source),
			known("texto", "observed", source),
			missing("Sem A"),
			missing("Sem A"),
			missing("Sem B"),
			known(2, "observed", official),
		]),
		{
			sources: [source, official],
			notVerified: ["Fonte não oficial: Fonte sintética", "Sem A", "Sem B"],
			hasMissing: true,
			natures: ["observed"],
		},
	);
	assert.deepEqual(collectEvidence([]), {
		sources: [],
		notVerified: [],
		hasMissing: false,
		natures: [],
	});
});

test("normalizes known weights and preserves missing coverage", () => {
	const items = [
		{ key: "a", value: known(2, "informed", source) },
		{ key: "b", value: known(6, "informed", source) },
	];
	assert.deepEqual(weightsWithCoverage(items), {
		weights: { a: 0.25, b: 0.75 },
		knownTotal: 8,
		coverage: "complete",
		missingKeys: [],
	});
	assert.deepEqual(weightsWithCoverage([...items, { key: "c", value: missing("Sem C") }]), {
		weights: { a: 0.25, b: 0.75 },
		knownTotal: 8,
		coverage: "partial",
		missingKeys: ["c"],
	});
	assert.deepEqual(weightsWithCoverage([{ key: "c", value: missing("Sem C") }]), {
		weights: {},
		knownTotal: null,
		coverage: "empty",
		missingKeys: ["c"],
	});
	assert.deepEqual(weightsWithCoverage([{ key: "zero", value: known(0, "informed", source) }]), {
		weights: {},
		knownTotal: null,
		coverage: "empty",
		missingKeys: [],
	});
	assert.throws(
		() => weightsWithCoverage([{ key: "a", value: known(-1, "informed", source) }]),
		/negativos/,
	);
	assert.throws(
		() => weightsWithCoverage([{ key: "a", value: known(NaN, "informed", source) }]),
		/finito/,
	);
	assert.throws(() => weightsWithCoverage([...items, ...items]), /únicas/);
	assert.deepEqual(
		weightsWithCoverage([{ key: "__proto__", value: known(1, "informed", source) }]).weights,
		Object.fromEntries([["__proto__", 1]]),
	);
});

test("preserves dated sources and rejects conflicting metadata for the same identity", () => {
	const later = { ...source, asOf: "2026-03-03", label: "Fonte atualizada" };
	assert.deepEqual(
		collectEvidence([
			known(1, "informed", source),
			known(2, "informed", { ...source }),
			known(3, "informed", later),
		]).sources,
		[source, later],
	);
	for (const conflicting of [
		{ ...source, label: "Outro rótulo" },
		{ ...source, url: "https://example.test/source" },
		{ ...source, official: true },
	]) {
		assert.throws(
			() => collectEvidence([known(1, "informed", source), known(2, "observed", conflicting)]),
			/Fonte duplicada com dados divergentes/,
		);
	}
});

test("discloses observed non-official and estimated sources independently of first nature", () => {
	const official = { ...source, id: "official", official: true };
	assert.deepEqual(collectEvidence([known(1, "informed", source)]).notVerified, []);
	assert.deepEqual(
		collectEvidence([
			known(1, "estimated", source),
			known(2, "estimated", { ...source }),
			known(3, "informed", source),
			known(4, "observed", source),
			known(5, "observed", { ...source }),
			known(6, "observed", official),
			known(7, "estimated", official),
		]),
		{
			sources: [source, official],
			notVerified: ["Valor estimado: Fonte sintética", "Fonte não oficial: Fonte sintética"],
			hasMissing: false,
			natures: ["informed", "observed", "estimated"],
		},
	);
	assert.deepEqual(
		collectEvidence([known(1, "informed", source), known(2, "observed", source)]).notVerified,
		["Fonte não oficial: Fonte sintética"],
	);
});

test("empty sums narrow to null and empty weights have no known total", () => {
	const sum = sumWithCoverage([missing("Sem valor")]);
	if (sum.coverage === "empty") {
		const total: null = sum.total;
		assert.equal(total, null);
	} else {
		const total: number = sum.total;
		assert.fail(`Cobertura inesperada com total ${total}`);
	}
	assert.deepEqual(weightsWithCoverage([]), {
		weights: {},
		knownTotal: null,
		coverage: "empty",
		missingKeys: [],
	});
});
