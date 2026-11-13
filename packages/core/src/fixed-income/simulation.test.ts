import assert from "node:assert/strict";
import test from "node:test";
import { approxEqual } from "../units.js";
import {
	base,
	calendar,
	candidate,
	datum,
	missing,
	noCustody,
	scenario,
	simulationInput,
	source,
} from "./fixtures.test.js";
import { analyzeRateRisk, type FixedIncomeInput, simulateFixedIncome } from "./index.js";

test("public R1 envelope keeps evidence, assumptions and comparisons for each scenario", () => {
	const input = simulationInput();
	const result = simulateFixedIncome(
		{
			...input,
			scenarios: [datum(scenario), datum({ ...scenario, id: "alt", kind: "alternative" })],
			comparisons: [{ candidateId: "fixed", product: "cdb", custody: datum(noCustody) }],
			turningPoints: [{ candidateId: "fixed", custody: datum(noCustody), taxExempt: false }],
		},
		calendar,
	);
	assert.equal(result.method.id, "r1.fixed-income-simulation");
	assert.equal(result.strategyVersion, "synthetic-v1");
	assert.equal(result.status, "complete");
	assert.ok(result.output);
	assert.equal(result.output.length, 2);
	for (const row of result.output) {
		assert.equal(row.value.nature, "estimated");
		assert.ok(approxEqual(row.value.gross, 1000 * 1.1 ** (260 / 252)));
		assert.equal(row.breakEvens.length, 1);
		assert.ok(row.turningPoint !== null && Math.abs(row.turningPoint - 0.1) < 1e-9);
	}
	assert.deepEqual(result.sources, [source]);
	assert.deepEqual(result.notVerified, [
		"taxa de custódia própria da instituição, quando não informada",
		"mudança de regra tributária depois da data da análise",
		"preço de venda antecipada fica a cargo do R2",
	]);
	for (const finding of result.findings)
		assert.doesNotMatch(finding.message, /compr|vend|recomend/i);
});
test("missing data stays missing, missing custody never becomes zero", () => {
	const input = simulationInput();
	const partial = simulateFixedIncome(
		{
			...input,
			candidates: [
				...input.candidates,
				datum({ ...candidate, id: "unknown-fee", custody: missing("Custódia ausente") }),
			],
		},
		calendar,
	);
	assert.equal(partial.status, "partial");
	assert.ok(partial.output);
	assert.equal(partial.output.length, 1);
	assert.ok(partial.notVerified.includes("Custódia ausente"));
	const empty = simulateFixedIncome(
		{ ...input, principal: missing("Principal ausente") },
		calendar,
	);
	assert.equal(empty.status, "inconclusive");
	assert.equal(empty.output, null);
	const bond = datum({ id: "zero", face: 1000, annualYield: 0.1, maturity: base.to });
	assert.equal(
		analyzeRateRisk(
			{ asOf: base.asOf, strategyVersion: null, bond, goalDate: missing("Objetivo ausente") },
			calendar,
		).status,
		"partial",
	);
	assert.equal(
		analyzeRateRisk(
			{
				asOf: base.asOf,
				strategyVersion: null,
				bond: missing("Título ausente"),
				goalDate: datum(base.to),
			},
			calendar,
		).output,
		null,
	);
});
test("R1 isolates maturity and solver data conditions while preserving other rows", () => {
	const input = simulationInput();
	const comparisons = [
		{ candidateId: candidate.id, product: "cdb", custody: datum(noCustody) },
	] satisfies NonNullable<FixedIncomeInput["comparisons"]>;
	for (const change of [
		{ solver: { upper: 0.001 } },
		{ scenarios: [datum({ ...scenario, steps: [{ effectiveFrom: base.from, annualRate: 0 }] })] },
		{
			scenarios: [datum({ ...scenario, steps: [{ effectiveFrom: base.from, annualRate: -0.01 }] })],
		},
	]) {
		const result = simulateFixedIncome({ ...input, comparisons, ...change }, calendar);
		assert.equal(result.status, "partial");
		assert.ok(result.output?.length);
		for (const row of result.output) {
			assert.deepEqual(row.breakEvens, []);
			assert.equal(row.turningPoint, null);
		}
		assert.ok(
			result.findings.some((f) => f.severity === "warning" && f.subject === "fixed/constant"),
		);
		assert.ok(result.notVerified.length > 3);
	}
	const result = simulateFixedIncome(
		{
			...input,
			candidates: [
				datum({ ...candidate, id: "expired", maturity: "2026-03-01" }),
				datum(candidate),
			],
		},
		calendar,
	);
	assert.equal(result.status, "partial");
	assert.deepEqual(
		result.output?.map((row) => row.candidateId),
		["fixed"],
	);
	assert.ok(result.findings.some((f) => f.subject === "expired" && f.severity === "warning"));
	const empty = simulateFixedIncome(
		{
			...input,
			candidates: [datum({ ...candidate, maturity: "2026-03-01" })],
		},
		calendar,
	);
	assert.equal(empty.status, "inconclusive");
	assert.equal(empty.output, null);

	const mixed = simulateFixedIncome(
		{
			...input,
			comparisons,
			scenarios: [
				datum(scenario),
				datum({ ...scenario, id: "flat", steps: [{ effectiveFrom: base.from, annualRate: 0 }] }),
			],
		},
		calendar,
	);
	assert.equal(mixed.status, "partial");
	assert.equal(mixed.output?.length, 2);
	assert.equal(mixed.output?.[0]?.breakEvens.length, 1);
	assert.deepEqual(mixed.output?.[1]?.breakEvens, []);
});
test("R1 validates duplicate ids and reports unknown requests and non-prefixed turning points", () => {
	const input = simulationInput();
	const request = { candidateId: candidate.id, custody: datum(noCustody), taxExempt: false };
	for (const change of [
		{ candidates: [datum(candidate), datum(candidate)] },
		{ scenarios: [datum(scenario), datum(scenario)] },
		{ turningPoints: [request, request] },
	])
		assert.throws(() => simulateFixedIncome({ ...input, ...change }, calendar), /duplicados/);
	for (const change of [
		{
			comparisons: [{ candidateId: "unknown", product: "cdb", custody: datum(noCustody) }],
		} satisfies Partial<FixedIncomeInput>,
		{ turningPoints: [{ ...request, candidateId: "unknown" }] },
	]) {
		const result = simulateFixedIncome({ ...input, ...change }, calendar);
		assert.equal(result.status, "partial");
		assert.ok(result.findings.some((f) => f.subject === "unknown" && f.severity === "warning"));
		assert.ok(result.notVerified.includes("Candidato solicitado não encontrado."));
	}
	const result = simulateFixedIncome(
		{
			...input,
			candidates: [datum({ ...candidate, rate: { kind: "selic-like" } })],
			comparisons: [{ candidateId: candidate.id, product: "cdb", custody: datum(noCustody) }],
			turningPoints: [request],
		},
		calendar,
	);
	assert.equal(result.status, "partial");
	assert.deepEqual(result.output?.[0]?.breakEvens, []);
	assert.equal(result.output?.[0]?.turningPoint, null);
	assert.ok(result.findings.some((f) => f.subject === "fixed/constant"));
});
test("solver failures never swallow invalid dates, tables or calendar contracts", () => {
	const input = {
		...simulationInput(),
		comparisons: [
			{
				candidateId: candidate.id,
				product: "cdb",
				custody: datum({ ...noCustody, validUntil: "2026-02-01" }),
			},
		],
	} satisfies FixedIncomeInput;
	assert.throws(() => simulateFixedIncome(input, calendar), /vigência/);
	assert.throws(
		() =>
			simulateFixedIncome(
				{
					...simulationInput(),
					candidates: [datum({ ...candidate, maturity: "invalid" })],
				},
				calendar,
			),
		/Data inválida/,
	);
	const result = simulateFixedIncome(
		{
			...simulationInput(),
			comparisons: [{ candidateId: candidate.id, product: "cdb", custody: datum(noCustody) }],
			solver: { tolerance: 1e-30 },
		},
		calendar,
	);
	assert.equal(result.status, "partial");
	assert.ok(result.findings.some((f) => f.code === "SOLVER_UNAVAILABLE"));
});
test("both analysis envelopes snapshot full calendar provenance", () => {
	const results = [
		simulateFixedIncome(simulationInput(), calendar),
		analyzeRateRisk(
			{
				asOf: base.asOf,
				strategyVersion: null,
				bond: datum({ id: "zero", face: 1000, annualYield: 0.1, maturity: base.to }),
				goalDate: datum(base.to),
			},
			calendar,
		),
	];
	for (const result of results) {
		assert.deepEqual(result.assumptions.calendar, {
			coveredFrom: "2026-01-01",
			coveredUntil: "2030-12-31",
			holidayCount: 1,
			holidays: ["2026-03-04"],
		});
		assert.notEqual(result.assumptions.calendar.holidays, calendar.holidays);
	}
});
