import assert from "node:assert/strict";
import test from "node:test";
import { known, missing } from "../provenance.js";
import type { MonthlySeries } from "../series.js";
import { analyzeGoalTracking, type GoalTrackingInput } from "./goal-tracking.js";

const source = { id: "synthetic", label: "Cenário sintético", asOf: "2026-01-01", official: true };
const series = (values: number[]): MonthlySeries =>
	values.map((value, i) => ({ month: `2026-0${i + 1}`, value: known(value, "informed", source) }));
function fixture(): GoalTrackingInput {
	return {
		targetValue: 3000,
		targetMonth: "2026-12",
		asOf: "2026-02",
		strategyVersion: "synthetic-v1",
		frozenProjection: {
			plannedContributions: series([0, 100]),
			projectedValues: series([1000, 1200]),
		},
		realizedContributions: series([0, 100]),
		realizedValues: series([1000, 1180]),
	};
}
test("R8: rendimento 20% abaixo do projetado gera causa rendimento", () => {
	const input = fixture();
	const snapshot = JSON.stringify(input.frozenProjection);
	const result = analyzeGoalTracking(input);
	assert.equal(result.status, "complete");
	const row = result.output.months[1];
	assert.ok(row);
	assert.equal(row.projectedGain, 100);
	assert.equal(row.realizedGain, 80);
	assert.deepEqual(row.causes, ["rendimento"]);
	assert.equal(result.output.months[0]?.realizedGain, null);
	assert.equal(result.findings[0]?.code, "return_shortfall");
	assert.ok(result.findings.every((f) => !/compr|vend|recomend/i.test(f.message)));
	assert.equal(JSON.stringify(input.frozenProjection), snapshot);
});
test("R8: aporte menor conhecido e aporte sem declaração têm causa aporte", () => {
	const input = fixture();
	input.realizedContributions = series([0, 0]);
	input.realizedValues = series([1000, 1100]);
	const result = analyzeGoalTracking(input);
	if (result.status === "inconclusive") return;
	assert.deepEqual(result.output.months[1]?.causes, ["aporte"]);
	input.realizedContributions = [
		{ month: "2026-01", value: known(0, "informed", source) },
		{ month: "2026-02", value: missing("Caixa não declarado") },
	];
	const partial = analyzeGoalTracking(input);
	assert.equal(partial.status, "partial");
	assert.equal(partial.output.months[1]?.realizedContribution, null);
	assert.equal(partial.output.months[1]?.realizedGain, null);
	assert.deepEqual(partial.output.months[1]?.causes, ["aporte"]);
	assert.ok(partial.notVerified.includes("Caixa não declarado"));
});
test("R8: mês ausente não vira zero nem conecta ganhos através do intervalo", () => {
	const input = fixture();
	input.asOf = "2026-03";
	input.frozenProjection = {
		plannedContributions: series([0, 100, 100]),
		projectedValues: series([1000, 1200, 1400]),
	};
	input.realizedValues = series([1000, 1180, 1400]).filter((p) => p.month !== "2026-02");
	input.realizedContributions = series([0, 100, 100]);
	const result = analyzeGoalTracking(input);
	assert.equal(result.status, "partial");
	assert.equal(result.output.months[1]?.realizedValue, null);
	assert.equal(result.output.months[2]?.realizedGain, null);
	assert.ok(result.notVerified.includes("Mês sem cobertura completa: 2026-02"));
});
test("R8: dinheiro parado requer aporte positivo e fechamento sem crescimento", () => {
	const input = fixture();
	input.realizedValues = series([1000, 1000]);
	const result = analyzeGoalTracking(input);
	if (result.status === "inconclusive") return;
	assert.deepEqual(result.output.months[1]?.causes, ["dinheiro parado"]);
	assert.equal(result.output.months[1]?.realizedGain, -100);
});
test("R8: limite é estrito, configurável, e ganhos negativos usam escala absoluta", () => {
	const input = fixture();
	input.realizedValues = series([1000, 1185]);
	assert.deepEqual(analyzeGoalTracking(input).findings, []);
	input.alertThreshold = 0.1;
	assert.equal(analyzeGoalTracking(input).findings[0]?.code, "return_shortfall");
	input.frozenProjection.projectedValues = series([1000, 1050]);
	input.realizedValues = series([1000, 1040]);
	assert.equal(analyzeGoalTracking(input).findings[0]?.code, "return_shortfall");
	input.alertThreshold = NaN;
	assert.throws(() => analyzeGoalTracking(input), /Limite/);
});
