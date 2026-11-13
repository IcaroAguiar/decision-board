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
	assert.ok(
		[...result.findings.map((finding) => finding.message), ...result.notVerified].every(
			(message) => !/compr|vend|recomend/i.test(message),
		),
	);
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
	assert.equal(partial.status, "inconclusive");
	assert.equal(partial.output, null);
	assert.ok(partial.notVerified.includes("Caixa não declarado"));
	assert.ok(partial.notVerified.includes("Aporte do mês 2026-02 não informado."));
	assert.deepEqual(partial.findings, []);
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
	assert.equal(result.output, null);
	assert.equal(result.status, "inconclusive");
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
	assert.equal(result.findings.length, 2);
	assert.equal(
		result.findings[0]?.message,
		"Alerta: ganho acumulado abaixo do cenário projetado; causas prováveis: rendimento, dinheiro parado.",
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
test("R8: ausência de projeção inicial é recusada", () => {
	const input = fixture();
	input.frozenProjection.projectedValues = [];
	assert.throws(() => analyzeGoalTracking(input), /fechamento inicial/);
});
test("R8: ausência de fechamentos realizados é inconclusiva e não atribui causas", () => {
	const input = fixture();
	input.realizedValues = [];
	const result = analyzeGoalTracking(input);
	assert.equal(result.status, "inconclusive");
	assert.equal(result.output, null);
	assert.deepEqual(result.findings, []);
});
test("R8: aporte isolado emite alerta próprio com valor exato sem alerta de ganho", () => {
	const input = fixture();
	input.realizedContributions = series([0, 0]);
	input.realizedValues = series([1000, 1100]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.output.contributionShortfall, 100);
	assert.equal(result.output.returnShortfall, 0);
	assert.deepEqual(
		result.findings.map((finding) => finding.code),
		["contribution_shortfall"],
	);
	assert.match(
		result.findings[0]?.message ?? "",
		/aporte abaixo do planejado; déficit conhecido de 100/,
	);
});
test("R8: alerta de rendimento puro quantifica déficit sem causa aporte", () => {
	const result = analyzeGoalTracking(fixture());
	assert.ok(result.output);
	assert.equal(result.output.contributionShortfall, 0);
	assert.equal(result.output.returnShortfall, 20);
	assert.match(result.findings[0]?.message ?? "", /causas prováveis: rendimento\./);
});
test("R8: aporte quase igual não gera achado", () => {
	const input = fixture();
	input.realizedContributions = series([0, 100 - 1e-11]);
	input.realizedValues = series([1000, 1200]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.deepEqual(result.output.months[1]?.causes, []);
	assert.equal(result.output.contributionShortfall, 0);
	assert.deepEqual(result.findings, []);
});
test("R8: contribuição ausente no mês base não torna ganhos parciais", () => {
	const input = fixture();
	input.realizedContributions = series([0, 100]).slice(1);
	input.frozenProjection.plannedContributions = series([0, 100]).slice(1);
	const result = analyzeGoalTracking(input);
	assert.equal(result.status, "complete");
	assert.ok(result.output);
	assert.equal(result.output.comparableMonths, 1);
});
test("R8: valores negativos são recusados em qualquer série", () => {
	for (const field of [
		"plannedContributions",
		"projectedValues",
		"realizedContributions",
		"realizedValues",
	]) {
		const input = fixture();
		const negative = series([1000, -1]);
		switch (field) {
			case "plannedContributions":
				input.frozenProjection.plannedContributions = negative;
				break;
			case "projectedValues":
				input.frozenProjection.projectedValues = negative;
				break;
			case "realizedContributions":
				input.realizedContributions = negative;
				break;
			case "realizedValues":
				input.realizedValues = negative;
				break;
		}
		assert.throws(() => analyzeGoalTracking(input), /negativos/);
	}
});
test("R8: prazo anterior ao plano é recusado", () => {
	const input = fixture();
	input.targetMonth = "2025-12";
	assert.throws(() => analyzeGoalTracking(input), /antes do início/);
});
test("R8: referência anterior ao plano é recusada", () => {
	const input = fixture();
	input.asOf = "2025-12";
	assert.throws(() => analyzeGoalTracking(input), /fechamento inicial/);
});
test("R8: déficit logo acima do limite dispara alerta", () => {
	const input = fixture();
	input.realizedValues = series([1000, 1185 - 1e-7]);
	assert.equal(analyzeGoalTracking(input).findings[0]?.code, "cumulative_gain_shortfall");
});

test("R8: déficit de aporte e ganho têm alertas separados sem atribuir ganho ao aporte", () => {
	const input = fixture();
	input.realizedContributions = series([0, 50]);
	input.realizedValues = series([1000, 1130]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.output.contributionShortfall, 50);
	assert.equal(result.output.returnShortfall, 20);
	assert.deepEqual(result.output.months[1]?.causes, ["aporte", "rendimento"]);
	assert.deepEqual(
		result.findings.map((finding) => finding.code),
		["cumulative_gain_shortfall", "contribution_shortfall"],
	);
	assert.match(result.findings[0]?.message ?? "", /causas prováveis: rendimento\./);
});

test("R8: arredonda déficit só na mensagem e preserva ganho superior como negativo", () => {
	const input = fixture();
	input.realizedContributions = series([0, 99.7]);
	input.realizedValues = series([1000, 1210]);
	const result = analyzeGoalTracking(input);
	assert.ok(result.output);
	assert.equal(result.output.contributionShortfall, 100 - 99.7);
	assert.ok(result.output.returnShortfall !== null && result.output.returnShortfall < 0);
	assert.equal(
		result.findings[0]?.message,
		"Alerta: aporte abaixo do planejado; déficit conhecido de 0.3.",
	);
});
