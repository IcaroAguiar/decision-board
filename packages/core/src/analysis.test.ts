import assert from "node:assert/strict";
import test from "node:test";
import { type AnalysisResult, createAnalysisResult, type SourceRef } from "./index.js";

const source: SourceRef = {
	id: "synthetic-source",
	label: "Fonte sintética",
	asOf: "2026-03-02",
	official: false,
};
const complete: AnalysisResult<{ value: number }, { total: number }> = {
	method: { id: "synthetic-scenario", version: "1.0.0" },
	status: "complete",
	asOf: "2026-03-03",
	inputs: { value: 2 },
	assumptions: { scenario: "sintético", factor: 2, simulated: true },
	sources: [source],
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
			createAnalysisResult({ ...complete, status: "inconclusive", notVerified: ["Fonte ausente"] }),
		/saída nula/,
	);
	assert.throws(() => createAnalysisResult({ ...complete, output: null }), /saída nula/);
	assert.throws(
		() =>
			createAnalysisResult({
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

test("deduplicates sources by id, preserving first occurrence and input arrays", () => {
	const other = { ...source, id: "synthetic-other" };
	const sources = [source, { ...source, label: "Duplicada" }, other];
	assert.deepEqual(createAnalysisResult({ ...complete, sources }).sources, [source, other]);
	assert.equal(sources.length, 3);
});

test("rejects empty method identity, invalid analysis dates and invalid source dates", () => {
	assert.throws(
		() => createAnalysisResult({ ...complete, method: { id: " ", version: "1" } }),
		/método/,
	);
	assert.throws(
		() => createAnalysisResult({ ...complete, method: { id: "scenario", version: "" } }),
		/método/,
	);
	assert.throws(() => createAnalysisResult({ ...complete, asOf: "2026-02-30" }), /Data inválida/);
	assert.throws(
		() => createAnalysisResult({ ...complete, sources: [{ ...source, asOf: "2026-02-30" }] }),
		/Data inválida/,
	);
});
