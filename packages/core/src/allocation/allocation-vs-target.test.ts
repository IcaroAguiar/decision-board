import assert from "node:assert/strict";
import test from "node:test";
import { known, missing } from "../provenance.js";
import { approxEqual } from "../units.js";
import { type AllocationVsTargetInput, analyzeAllocationVsTarget } from "./allocation-vs-target.js";

const source = { id: "synthetic", label: "Dados sintéticos", asOf: "2026-01-01", official: true };
const datum = (n: number) => known(n, "informed", source);
function fixture(): AllocationVsTargetInput {
	return {
		positions: [
			{
				assetId: "a",
				part: "variableIncome",
				assetClass: "shares",
				institution: "i",
				segment: "s",
				custody: "b3",
				value: datum(800),
			},
			{
				assetId: "b",
				part: "goal",
				assetClass: "bonds",
				institution: "j",
				segment: "t",
				custody: "b3",
				value: datum(200),
			},
		],
		contributionAmount: 600,
		allowedAssetIds: ["b"],
		candidates: [
			{
				assetId: "b",
				ticker: "SYNB",
				part: "goal",
				assetClass: "bonds",
				institution: "j",
				segment: "t",
				currentPrice: 100,
				lotSize: 1,
				metricSourceRefs: [
					{ metric: "price", label: "Preço sintético" },
					{ metric: "part", label: "Estratégia sintética" },
					{ metric: "lotSize", label: "Lote sintético" },
				],
			},
		],
		partTargets: {
			reserve: { target: 0, band: { min: 0, max: 0 } },
			goal: { target: 0.5, band: { min: 0.45, max: 0.55 } },
			variableIncome: { target: 0.5, band: { min: 0.45, max: 0.55 } },
		},
		classTargets: { shares: { target: 0.5, band: { min: 0.45, max: 0.55 } } },
		allowSales: false,
		minOperationValue: 100,
		strategyVersion: "synthetic-v1",
		asOf: "2026-02-15",
	};
}
test("R7: faixa por classe, aporte sem quantidade negativa e redução exata do desvio", () => {
	const result = analyzeAllocationVsTarget(fixture());
	assert.ok(result.output);
	assert.equal(result.status, "complete");
	assert.ok(
		result.findings.some(
			(finding) => finding.code === "allocation_out_of_band" && finding.subject === "shares",
		),
	);
	const proposal = result.output.proposal;
	assert.ok(proposal);
	assert.deepEqual(
		proposal.planItems.map((position) => [
			position.assetId,
			position.quantity,
			position.referencePrice,
		]),
		[["b", 6, 100]],
	);
	assert.ok(proposal.planItems.every((position) => position.quantity >= 0));
	assert.equal(proposal.investedAmount, 600);
	assert.ok(approxEqual(result.output.maxDeviationBefore ?? NaN, 0.375));
	assert.equal(result.output.maxDeviationAfter, 0);
	assert.ok(
		[...result.findings.map((finding) => finding.message), ...result.notVerified].every(
			(message) => !/compr|vend|recomend/i.test(message),
		),
	);
});
test("R7: posição ausente é parcial, identificada e impede proposta", () => {
	const input = fixture();
	const position = input.positions[0];
	assert.ok(position);
	position.value = missing("Valor de a ausente");
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.output);
	assert.equal(result.status, "partial");
	assert.deepEqual(result.output.missingPositions, ["a"]);
	assert.equal(result.output.proposal, null);
	assert.ok(result.notVerified.includes("Valor de a ausente"));
});
test("R7: concentração por ativo e instituição; posição antiga e sem setor", () => {
	const input = fixture();
	input.concentrationLimits = { perAsset: 0.7, perInstitution: 0.7 };
	const position = input.positions[0];
	assert.ok(position);
	position.custody = "outside-b3";
	position.segment = undefined;
	input.candidates = [];
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.output);
	assert.ok(
		result.findings.some(
			(finding) => finding.code === "concentration_asset" && finding.subject === "a",
		),
	);
	assert.ok(
		result.findings.some(
			(finding) => finding.code === "concentration_institution" && finding.subject === "i",
		),
	);
	assert.ok(result.notVerified.includes("Posição fora da B3 desatualizada: a"));
	assert.ok(result.notVerified.includes("Ativo sem classificação de setor: a"));
});
test("R7: permitir alienação apenas declara limitação e mínimo reúne lotes inteiros", () => {
	const input = fixture();
	input.allowSales = true;
	input.minOperationValue = 250;
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.output);
	assert.ok(result.notVerified.includes("Venda não simulada nesta versão"));
	assert.deepEqual(
		result.output.proposal?.planItems.map((position) => position.quantity),
		[6],
	);
	input.minOperationValue = 700;
	const blocked = analyzeAllocationVsTarget(input);
	assert.ok(blocked.output);
	assert.deepEqual(blocked.output.proposal?.planItems, []);
});
test("R7: alvos decimais inválidos e metadados inconsistentes são recusados", () => {
	const input = fixture();
	input.partTargets.goal.target = 50;
	assert.throws(() => analyzeAllocationVsTarget(input), /fração|faixa/);
	const other = fixture();
	const candidate = other.candidates[0];
	assert.ok(candidate);
	candidate.assetClass = "wrong";
	assert.throws(() => analyzeAllocationVsTarget(other), /inconsistentes/);
});
test("R7: agrega ativo em duas custódias sem agregar concentração institucional", () => {
	const input = fixture();
	const position = input.positions[0];
	assert.ok(position);
	input.positions = [
		{ ...position, value: datum(400), segment: undefined },
		{ ...position, institution: "k", value: datum(400) },
		...input.positions.slice(1),
	];
	input.concentrationLimits = { perAsset: 0.7, perInstitution: 0.5 };
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.output?.proposal);
	assert.equal(result.output.proposal.postAllocation.byAsset.a, 0.5);
	assert.equal(result.output.proposal.postAllocation.byInstitution.i, 0.25);
	assert.equal(result.output.proposal.postAllocation.byInstitution.k, 0.25);
	assert.equal(result.output.proposal.postAllocation.bySegment.s, 0.5);
	assert.ok(result.findings.some((finding) => finding.code === "concentration_asset"));
	assert.ok(!result.findings.some((finding) => finding.code === "concentration_institution"));
});
test("R7: setores conflitantes e candidato sem setor são não verificados", () => {
	const input = fixture();
	const position = input.positions[0];
	assert.ok(position);
	input.positions.push({ ...position, segment: "outro", value: datum(0) });
	const candidate = input.candidates[0];
	assert.ok(candidate);
	candidate.segment = undefined;
	candidate.institution = "new-custody";
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.notVerified.includes("Setores conflitantes para o ativo: a"));
	assert.ok(result.notVerified.includes("Ativo sem classificação de setor: b"));
	assert.equal(result.output?.proposal?.postAllocation.bySegment.t, 0.5);
	assert.equal(result.output?.proposal?.postAllocation.byInstitution["new-custody"], 0.375);
});
test("R7: cobertura vazia é inconclusiva com saída nula", () => {
	const input = fixture();
	input.positions = [];
	const result = analyzeAllocationVsTarget(input);
	assert.equal(result.status, "inconclusive");
	assert.equal(result.output, null);
});
test("R7: alertas de base parcial qualificam patrimônio e alvos ainda são validados", () => {
	const input = fixture();
	const position = input.positions[1];
	assert.ok(position);
	position.value = missing("Valor sintético ausente");
	input.concentrationLimits = { perAsset: 0.7 };
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.output);
	const alerts = result.findings.filter((finding) =>
		["allocation_out_of_band", "concentration_asset"].includes(finding.code),
	);
	assert.ok(alerts.length >= 2);
	assert.ok(alerts.every((finding) => finding.message.includes("sobre o patrimônio conhecido")));
	input.partTargets.goal.target = 0.45;
	assert.throws(() => analyzeAllocationVsTarget(input), /somar 1/);
	input.partTargets.goal.band.min = 0.6;
	assert.throws(() => analyzeAllocationVsTarget(input), /faixa/);
});
test("R7: saturação é informativa e desvios por dimensão usam o denominador final", () => {
	const input = fixture();
	input.concentrationLimits = { perAsset: 0.25 };
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.output);
	assert.equal(result.status, "complete");
	assert.equal(
		result.findings.find((finding) => finding.code === "allocation_limit_reached")?.severity,
		"info",
	);
	assert.equal(result.output.maxDeviationBefore, 0.375);
	assert.equal(result.output.byPart.find((row) => row.key === "goal")?.deviationAfter, -0.25);
	assert.equal(result.output.byClass[0]?.deviationAfter, 0);
});
test("R7: emissor é distinto de custódia e dado ausente retém proposta", () => {
	const input = fixture();
	input.positions = input.positions.map((position) => ({ ...position, issuer: "issuer" }));
	input.candidates = input.candidates.map((candidate) => ({ ...candidate, issuer: "issuer" }));
	input.concentrationLimits = { perIssuer: 0.7 };
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.findings.some((finding) => finding.code === "concentration_issuer"));
	assert.equal(result.status, "complete");
	const candidate = input.candidates[0];
	assert.ok(candidate);
	candidate.issuer = undefined;
	const incomplete = analyzeAllocationVsTarget(input);
	assert.equal(incomplete.status, "partial");
	assert.equal(incomplete.output?.proposal, null);
	assert.ok(incomplete.notVerified.includes("Emissor não informado: b"));
});
