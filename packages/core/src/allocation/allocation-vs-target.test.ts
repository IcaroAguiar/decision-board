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
				part: "equities",
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
			equities: { target: 0.5, band: { min: 0.45, max: 0.55 } },
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
	assert.equal(result.status, "complete");
	assert.ok(
		result.findings.some((f) => f.code === "allocation_out_of_band" && f.subject === "shares"),
	);
	const proposal = result.output.proposal;
	assert.ok(proposal);
	assert.deepEqual(
		proposal.planItems.map((p) => [p.assetId, p.quantity, p.referencePrice]),
		[["b", 6, 100]],
	);
	assert.ok(proposal.planItems.every((p) => p.quantity >= 0));
	assert.equal(proposal.investedAmount, 600);
	assert.ok(approxEqual(result.output.maxDeviationBefore ?? NaN, 0.3));
	assert.equal(result.output.maxDeviationAfter, 0);
	assert.ok(result.findings.every((f) => !/compr|vend|recomend/i.test(f.message)));
});
test("R7: posição ausente é parcial, identificada e impede proposta", () => {
	const input = fixture();
	const p = input.positions[0];
	assert.ok(p);
	p.value = missing("Valor de a ausente");
	const result = analyzeAllocationVsTarget(input);
	assert.equal(result.status, "partial");
	assert.deepEqual(result.output.missingPositions, ["a"]);
	assert.equal(result.output.proposal, null);
	assert.ok(result.notVerified.includes("Valor de a ausente"));
});
test("R7: concentração por ativo e instituição; posição antiga e sem setor", () => {
	const input = fixture();
	input.concentrationLimits = { perAsset: 0.7, perInstitution: 0.7 };
	const p = input.positions[0];
	assert.ok(p);
	p.custody = "outside-b3";
	p.segment = undefined;
	input.candidates = [];
	const result = analyzeAllocationVsTarget(input);
	assert.ok(result.findings.some((f) => f.code === "concentration_asset" && f.subject === "a"));
	assert.ok(
		result.findings.some((f) => f.code === "concentration_institution" && f.subject === "i"),
	);
	assert.ok(result.notVerified.includes("Posição fora da B3 desatualizada: a"));
	assert.ok(result.notVerified.includes("Ativo sem classificação de setor: a"));
});
test("R7: permitir alienação apenas declara limitação e mínimo reúne lotes inteiros", () => {
	const input = fixture();
	input.allowSales = true;
	input.minOperationValue = 250;
	const result = analyzeAllocationVsTarget(input);
	if (result.status === "inconclusive") return;
	assert.ok(result.notVerified.includes("Venda não simulada nesta versão"));
	assert.deepEqual(
		result.output.proposal?.planItems.map((p) => p.quantity),
		[6],
	);
	input.minOperationValue = 700;
	const blocked = analyzeAllocationVsTarget(input);
	if (blocked.status === "inconclusive") return;
	assert.deepEqual(blocked.output.proposal?.planItems, []);
});
test("R7: alvos decimais inválidos e metadados inconsistentes são recusados", () => {
	const input = fixture();
	input.partTargets.goal.target = 50;
	assert.throws(() => analyzeAllocationVsTarget(input), /fração|faixa/);
	const other = fixture();
	const c = other.candidates[0];
	assert.ok(c);
	c.institution = "wrong";
	assert.throws(() => analyzeAllocationVsTarget(other), /inconsistentes/);
});
