import assert from "node:assert/strict";
import test from "node:test";
import { known, missing } from "../provenance.js";
import type { MonthlySeries } from "../series.js";
import { analyzeGoalTracking, type GoalTrackingInput } from "./goal-tracking.js";

const source = { id: "synthetic", label: "Cenário sintético", asOf: "2026-01-01", official: true };
const series = (values: number[]): MonthlySeries =>
	values.map((value, monthIndex) => ({
		month: `2026-0${monthIndex + 1}`,
		value: known(value, "informed", source),
	}));
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
	assert.ok(result.output);
	assert.equal(result.status, "complete");
	const row = result.output.months[1];
	assert.ok(row);
	assert.equal(row.projectedGain, 100);
	assert.equal(row.realizedGain, 80);
	assert.deepEqual(row.causes, ["rendimento"]);
	assert.equal(result.output.months[0]?.realizedGain, null);
	assert.equal(result.findings[0]?.code, "cumulative_gain_shortfall");
	assert.ok(result.findings.every((finding) => !/compr|vend|recomend/i.test(finding.message)));
	assert.equal(JSON.stringify(input.frozenProjection), snapshot);
});
test("R8: aporte conhecido zero tem causa aporte; ausente fica não verificado", () => {
	const input = fixture();
	input.realizedContributions = series([0, 0]);
	input.realizedValues = series([1000, 1100]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.deepEqual(result.output.months[1]?.causes, ["aporte"]);
	input.realizedContributions = [
		{ month: "2026-01", value: known(0, "informed", source) },
		{ month: "2026-02", value: missing("Caixa não declarado") },
	];
	const partial = analyzeGoalTracking(input);
	assert.equal(partial.status, "partial");
	assert.equal(partial.output.months[1]?.realizedContribution, null);
	assert.equal(partial.output.months[1]?.realizedGain, null);
	assert.deepEqual(partial.output.months[1]?.causes, []);
	assert.ok(partial.notVerified.includes("Caixa não declarado"));
	assert.ok(partial.notVerified.includes("Aporte do mês 2026-02 não informado."));
	assert.deepEqual(partial.findings, []);
	assert.equal(partial.output.cumulativeRealizedGain, null);
	assert.equal(partial.output.cumulativeProjectedGain, null);
	assert.equal(partial.output.comparableMonths, 0);
});
test("R8: mês ausente não vira zero nem conecta ganhos através do intervalo", () => {
	const input = fixture();
	input.asOf = "2026-03";
	input.frozenProjection = {
		plannedContributions: series([0, 100, 100]),
		projectedValues: series([1000, 1200, 1400]),
	};
	input.realizedValues = series([1000, 1180, 1400]).filter((point) => point.month !== "2026-02");
	input.realizedContributions = series([0, 100, 100]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.status, "partial");
	assert.equal(result.output.months[1]?.realizedValue, null);
	assert.equal(result.output.months[2]?.realizedGain, null);
	assert.ok(result.notVerified.includes("Mês sem cobertura completa: 2026-02"));
});
test("R8: dinheiro parado requer aporte positivo e fechamento sem crescimento", () => {
	const input = fixture();
	input.realizedValues = series([1000, 1000]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.deepEqual(result.output.months[1]?.causes, ["dinheiro parado"]);
	assert.equal(result.output.months[1]?.realizedGain, -100);
});
test("R8: limite é estrito, configurável, e ganhos negativos usam escala absoluta", () => {
	const input = fixture();
	input.realizedValues = series([1000, 1185]);
	assert.deepEqual(analyzeGoalTracking(input).findings, []);
	input.alertThreshold = 0.1;
	assert.equal(analyzeGoalTracking(input).findings[0]?.code, "cumulative_gain_shortfall");
	input.frozenProjection.projectedValues = series([1000, 1050]);
	input.realizedValues = series([1000, 1040]);
	assert.equal(analyzeGoalTracking(input).findings[0]?.code, "cumulative_gain_shortfall");
	input.alertThreshold = NaN;
	assert.throws(() => analyzeGoalTracking(input), /Limite/);
});

test("R8: soma ganhos mensais e emite um único alerta acumulado com causas agregadas", () => {
	const input = fixture();
	input.asOf = "2026-04";
	input.frozenProjection = {
		plannedContributions: series([0, 100, 100, 100]),
		projectedValues: series([1000, 1200, 1400, 1600]),
	};
	input.realizedContributions = series([0, 0, 100, 100]);
	input.realizedValues = series([1000, 1100, 1280, 1280]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.output.cumulativeProjectedGain, 300);
	assert.equal(result.output.cumulativeRealizedGain, 80);
	assert.equal(result.output.comparableMonths, 3);
	assert.equal(result.findings.length, 1);
	assert.equal(
		result.findings[0]?.message,
		"Alerta: ganho acumulado abaixo do cenário projetado; causas prováveis: aporte, rendimento, dinheiro parado.",
	);
});
test("R8: recuperação mensal evita alerta quando o acumulado fica só 10% abaixo", () => {
	const input = fixture();
	input.asOf = "2026-03";
	input.frozenProjection = {
		plannedContributions: series([0, 100, 100]),
		projectedValues: series([1000, 1200, 1400]),
	};
	input.realizedContributions = series([0, 100, 100]);
	input.realizedValues = series([1000, 1180, 1380]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.output.cumulativeProjectedGain, 200);
	assert.equal(result.output.cumulativeRealizedGain, 180);
	assert.deepEqual(result.output.months[1]?.causes, ["rendimento"]);
	assert.deepEqual(result.findings, []);
});
test("R8: compara somente os mesmos meses completos, sem preencher lacunas", () => {
	const input = fixture();
	input.asOf = "2026-04";
	input.frozenProjection = {
		plannedContributions: series([0, 100, 100, 100]),
		projectedValues: series([1000, 1200, 1400, 1600]),
	};
	input.realizedContributions = series([0, 100, 100, 100]).filter(
		(point) => point.month !== "2026-02",
	);
	input.realizedValues = series([1000, 1000, 1180, 1360]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.status, "partial");
	assert.equal(result.output.cumulativeProjectedGain, 200);
	assert.equal(result.output.cumulativeRealizedGain, 160);
	assert.deepEqual(result.output.months[1]?.causes, []);
	assert.equal(result.findings.length, 1);
	assert.match(result.findings[0]?.message ?? "", /causas prováveis: rendimento\./);
});
test("R8: ausência de fechamento ou projeção não gera causa por rendimento ou caixa", () => {
	for (const field of ["projected", "realized"]) {
		const input = fixture();
		if (field === "projected") input.frozenProjection.projectedValues = [];
		else input.realizedValues = [];
		if (field === "projected")
			assert.throws(() => analyzeGoalTracking(input), /fechamento inicial/);
		else {
			const result = analyzeGoalTracking(input);
			assert.ok(result.output);
			assert.deepEqual(result.findings, []);
			assert.deepEqual(
				result.output.months.map((row) => row.causes),
				[[], []],
			);
		}
	}
});
