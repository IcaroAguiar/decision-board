import assert from "node:assert/strict";
import test from "node:test";
import {
	type AnalysisResult,
	createAnalysisResult,
	methodIds,
	type SourceRef,
	statusFromCoverage,
	toAnalysisRef,
} from "./index.js";

const source: SourceRef = {
	id: "synthetic-source",
	label: "Fonte sintética",
	asOf: "2026-03-02",
	official: false,
};
const complete: AnalysisResult<{ value: number }, { total: number }> = {
	method: { id: methodIds.fixedIncomeSimulation, version: "1.0.0" },
	status: "complete",
	strategyVersion: null,
	asOf: "2026-03-03",
	inputs: { value: 2 },
	assumptions: { scenario: "sintético", factor: 2, simulated: true },
	sources: [source],
	natures: ["observed"],
	notVerified: [],
	findings: [],
	output: { total: 4 },
};

test("round-trips a complete analysis with all reproducibility metadata", () => {
	assert.deepEqual(createAnalysisResult(complete), complete);
	assert.deepEqual(createAnalysisResult({ ...complete, output: 0 }).output, 0);
});

test("requires null output if and only if the analysis is inconclusive", () => {
	assert.throws(
		() =>
			// @ts-expect-error Inconclusive output must be null, also enforced at runtime.
			createAnalysisResult({ ...complete, status: "inconclusive", notVerified: ["Fonte ausente"] }),
		/saída nula/,
	);
	assert.throws(() => createAnalysisResult({ ...complete, output: null }), /saída nula/);
	assert.throws(
		() =>
			// @ts-expect-error Partial output must be non-null.
			createAnalysisResult<{ value: number }, { total: number }>({
				...complete,
				status: "partial",
				output: null,
				notVerified: ["Fonte ausente"],
			}),
		/saída nula/,
	);
	const inconclusive = {
		...complete,
		status: "inconclusive",
		output: null,
		notVerified: ["Fonte ausente"],
	} satisfies AnalysisResult<{ value: number }, { total: number }>;
	assert.deepEqual(createAnalysisResult(inconclusive), inconclusive);
});

test("requires an explanation for partial and inconclusive analyses", () => {
	assert.throws(() => createAnalysisResult({ ...complete, status: "partial" }), /explique/);
	assert.throws(
		() => createAnalysisResult({ ...complete, status: "inconclusive", output: null }),
		/explique/,
	);
	assert.throws(
		() => createAnalysisResult({ ...complete, status: "partial", notVerified: [" "] }),
		/explique/,
	);
	const partial = {
		...complete,
		status: "partial",
		notVerified: ["Fonte ausente"],
	} satisfies AnalysisResult<{ value: number }, { total: number }>;
	assert.deepEqual(createAnalysisResult(partial), partial);
	const withFinding = {
		...complete,
		status: "partial",
		findings: [
			{
				code: "MISSING_SOURCE",
				severity: "warning",
				message: "Alerta: fonte ausente.",
				subject: "synthetic-source",
			},
		],
	} satisfies AnalysisResult<{ value: number }, { total: number }>;
	assert.deepEqual(createAnalysisResult(withFinding), withFinding);
	assert.throws(
		() =>
			createAnalysisResult({
				...withFinding,
				findings: [{ code: "MISSING_SOURCE", severity: "warning", message: " " }],
			}),
		/explique/,
	);
});

test("deduplicates sources by id and date, preserving first occurrence and input arrays", () => {
	const other = { ...source, id: "synthetic-other" };
	const later = { ...source, asOf: "2026-03-03" };
	const sources = [source, { ...source }, other, later];
	assert.deepEqual(createAnalysisResult({ ...complete, sources }).sources, [source, other, later]);
	assert.equal(sources.length, 4);
});

test("rejects empty method identity, invalid analysis dates and invalid source dates", () => {
	assert.throws(
		() =>
			createAnalysisResult({
				...complete,
				method: {
					// @ts-expect-error Method ids belong to the shared catalog.
					id: " ",
					version: "1",
				},
			}),
		/método/,
	);
	assert.throws(
		() =>
			createAnalysisResult({
				...complete,
				method: {
					// @ts-expect-error Method ids belong to the shared catalog.
					id: "r99.unknown",
					version: "1",
				},
			}),
		/catálogo/,
	);
	assert.throws(
		() => createAnalysisResult({ ...complete, method: { id: methodIds.rateRisk, version: "" } }),
		/método/,
	);
	assert.throws(() => createAnalysisResult({ ...complete, asOf: "2026-02-30" }), /Data inválida/);
	assert.throws(
		() => createAnalysisResult({ ...complete, sources: [{ ...source, asOf: "2026-02-30" }] }),
		/Data inválida/,
	);
});

test("blocks complete status when a finding is blocked", () => {
	const findings = [
		{ code: "MISSING_ANALYSIS", severity: "blocked", message: "Revisão necessária." },
	] satisfies AnalysisResult<null, null>["findings"];
	assert.throws(() => createAnalysisResult({ ...complete, findings }), /bloqueio/);
	assert.equal(
		createAnalysisResult({ ...complete, findings, status: "partial" }).status,
		"partial",
	);
});

test("narrows output by status and preserves typed assumptions", () => {
	const result = createAnalysisResult({ ...complete, assumptions: { path: [0.1, 0.2] } });
	if (result.status !== "inconclusive") assert.equal(result.output.total, 4);
	assert.deepEqual(result.assumptions.path, [0.1, 0.2]);
});

test("exports stable method identities and caller-assigned analysis references", () => {
	assert.deepEqual(methodIds, {
		fixedIncomeSimulation: "r1.fixed-income-simulation",
		rateRisk: "r2.rate-risk",
		correlationTest: "r3.correlation-test",
		allocationVsTarget: "r7.allocation-vs-target",
		goalTracking: "r8.goal-tracking",
	});
	assert.deepEqual(
		toAnalysisRef("synthetic-analysis", { ...complete, strategyVersion: "strategy-2" }),
		{
			id: "synthetic-analysis",
			method: { id: "r1.fixed-income-simulation", version: "1.0.0" },
			asOf: "2026-03-03",
			status: "complete",
			strategyVersion: "strategy-2",
		},
	);
	assert.equal(toAnalysisRef("synthetic-analysis", complete).strategyVersion, null);
	assert.throws(() => toAnalysisRef(" ", complete), /identificador/);
});

test("rejects conflicting source metadata for the same id and date", () => {
	for (const conflicting of [
		{ ...source, label: "Outro rótulo" },
		{ ...source, url: "https://example.test/source" },
		{ ...source, official: true },
	]) {
		assert.throws(
			() => createAnalysisResult({ ...complete, sources: [source, conflicting] }),
			/Fonte duplicada com dados divergentes/,
		);
	}
});

test("requires warning or blocked findings when no non-empty limitation is provided", () => {
	for (const status of ["partial", "inconclusive"] satisfies ("partial" | "inconclusive")[]) {
		const result: AnalysisResult<{ value: number }, { total: number }> =
			status === "partial" ? { ...complete, status } : { ...complete, status, output: null };
		assert.throws(
			() =>
				createAnalysisResult({
					...result,
					findings: [{ code: "NOTE", severity: "info", message: "Nota sintética" }],
				}),
			/explique/,
		);
		for (const severity of ["warning", "blocked"] satisfies ("warning" | "blocked")[]) {
			assert.equal(
				createAnalysisResult({
					...result,
					findings: [{ code: "LIMITATION", severity, message: "Revisão necessária" }],
				}).status,
				status,
			);
		}
	}
});

test("maps complete, partial and empty coverage to analysis status", () => {
	assert.equal(statusFromCoverage("complete"), "complete");
	assert.equal(statusFromCoverage("partial"), "partial");
	assert.equal(statusFromCoverage("empty"), "inconclusive");
});
