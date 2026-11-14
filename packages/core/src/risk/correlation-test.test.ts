import assert from "node:assert/strict";
import test from "node:test";
import { approxEqual, known, mean, methodIds, runCorrelationTest } from "../index.js";
import {
	assertNoPrescriptiveWording,
	createLcg,
	makeExactCorrelatedReturns,
	officialSource,
	toSeries,
	unofficialSource,
} from "./fixtures.test.js";

test("classifies risk reduction vs risk increase, recovers known correlation, and reports rolling min/max and worst months", () => {
	const endMonth = "2026-10";
	const rand = createLcg(101);
	const rAsset1 = Array.from({ length: 58 }, () => 0.005 + (rand() - 0.5) * 0.08);
	const rAsset2 = Array.from({ length: 58 }, () => 0.006 + (rand() - 0.5) * 0.09);
	const rPortfolio58 = rAsset1.map((r1, i) => 0.6 * r1 + 0.4 * (rAsset2[i] ?? 0));

	// Candidato de proteção: correlação exata -0.55 nos 58 meses com volatilidade moderada -> reduz risco.
	const rHedge = makeExactCorrelatedReturns(rPortfolio58, -0.55, 0.025, 202);
	// Candidato amplificador: correlação exata +0.92 e volatilidade maior que a carteira -> aumenta risco.
	const rAmplifier = makeExactCorrelatedReturns(rPortfolio58, 0.92, 0.075, 303);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: "v1",
		holdings: [
			{
				key: "ATIVO1",
				value: known(60_000, "observed", officialSource),
				returns: toSeries(endMonth, rAsset1, officialSource),
			},
			{
				key: "ATIVO2",
				value: known(40_000, "observed", officialSource),
				returns: toSeries(endMonth, rAsset2, officialSource),
			},
		],
		candidates: [
			{ key: "HEDGE11", returns: toSeries(endMonth, rHedge, unofficialSource) },
			{ key: "AMPL11", returns: toSeries(endMonth, rAmplifier, officialSource) },
		],
		contribution: known(25_000, "informed", officialSource),
	});

	if (result.status === "inconclusive") assert.fail("Esperado resultado completo.");
	assert.equal(result.method.id, methodIds.correlationTest);
	assert.equal(result.status, "complete");
	assert.equal(result.strategyVersion, "v1");
	assert.ok(result.notVerified.includes("Correlação passada não garante a futura."));
	assert.ok(result.notVerified.includes(`Fonte não oficial: ${unofficialSource.label}`));
	assertNoPrescriptiveWording(result.notVerified, result.findings);

	assert.ok(approxEqual(result.output.beforeWeights.ATIVO1 ?? 0, 0.6));
	assert.ok(approxEqual(result.output.beforeWeights.ATIVO2 ?? 0, 0.4));

	const hedge = result.output.candidates[0];
	const amplifier = result.output.candidates[1];
	assert.ok(hedge && amplifier);

	assert.equal(hedge.classification, "reduz risco");
	assert.equal(hedge.longestCompleteWindow, 58);
	assert.ok((hedge.volatilityAfter ?? 0) < (hedge.volatilityBefore ?? 0));

	const hedge58 = hedge.windows.find((w) => w.window === 58);
	assert.ok(hedge58 && hedge58.status === "complete");
	assert.ok(approxEqual(hedge58.correlation, -0.55, { relative: 1e-9, absolute: 1e-9 }));
	const rcAfterSum = Object.values(hedge58.riskContributionsAfter).reduce((a, b) => a + b, 0);
	assert.ok(approxEqual(rcAfterSum, 1));
	assert.ok("HEDGE11" in hedge58.riskContributionsAfter);

	assert.equal(amplifier.classification, "aumenta risco");
	assert.ok((amplifier.volatilityAfter ?? 0) > (amplifier.volatilityBefore ?? 0));
	const amp58 = amplifier.windows.find((w) => w.window === 58);
	assert.ok(amp58 && amp58.status === "complete");
	assert.ok(approxEqual(amp58.correlation, 0.92, { relative: 1e-9, absolute: 1e-9 }));

	// Correlação móvel de 24 meses sobre 58 meses gera 35 janelas e sempre traz mínimo e máximo.
	assert.ok(hedge.rollingCorrelation !== null);
	assert.equal(hedge.rollingCorrelation.windowMonths, 24);
	assert.equal(hedge.rollingCorrelation.observations, 35);
	assert.ok(hedge.rollingCorrelation.min <= hedge.rollingCorrelation.max);

	// Os 5 piores meses vêm ordenados do pior retorno da carteira para o menos ruim.
	assert.equal(hedge.worstMonths.length, 5);
	for (let i = 1; i < hedge.worstMonths.length; i += 1) {
		assert.ok(
			(hedge.worstMonths[i - 1]?.portfolioReturn ?? 0) <=
				(hedge.worstMonths[i]?.portfolioReturn ?? 0),
		);
	}
});

test("reports rolling correlation range capturing regime reversal across subperiods", () => {
	const endMonth = "2026-10";
	const rand = createLcg(999);
	const rHolding = Array.from({ length: 48 }, () => (rand() - 0.5) * 0.08);
	// Primeiros 24 meses: correlação -0.8; últimos 24 meses: correlação +0.8.
	const firstHalf = makeExactCorrelatedReturns(rHolding.slice(0, 24), -0.8, 0.03, 11);
	const secondHalf = makeExactCorrelatedReturns(rHolding.slice(24, 48), 0.8, 0.03, 22);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "BASE11",
				value: known(50_000, "observed", officialSource),
				returns: toSeries(endMonth, rHolding),
			},
		],
		candidates: [
			{
				key: "INSTAVEL11",
				returns: toSeries(endMonth, [...firstHalf, ...secondHalf]),
			},
		],
		contribution: known(10_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 3 },
	});

	if (result.status === "inconclusive") assert.fail("Esperado completo.");
	assert.equal(result.status, "complete");
	const rolling = result.output.candidates[0]?.rollingCorrelation;
	assert.ok(rolling);
	assert.ok(approxEqual(rolling.min, -0.8, { relative: 1e-9, absolute: 1e-9 }));
	assert.ok(approxEqual(rolling.max, 0.8, { relative: 1e-9, absolute: 1e-9 }));
});

test("handles adding contribution to a candidate that is already in holdings with updated weights, volatility and risk contributions", () => {
	const endMonth = "2026-10";
	const rand = createLcg(808);
	const r1 = Array.from({ length: 30 }, () => 0.005 + (rand() - 0.5) * 0.09);
	const r2 = makeExactCorrelatedReturns(r1, -0.4, 0.03, 909);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "ATIVO1",
				value: known(80_000, "observed", officialSource),
				returns: toSeries(endMonth, r1),
			},
			{
				key: "ATIVO2",
				value: known(20_000, "observed", officialSource),
				returns: toSeries(endMonth, r2),
			},
		],
		candidates: [{ key: "ATIVO2", returns: toSeries(endMonth, r2) }],
		contribution: known(25_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 5 },
	});

	if (result.status === "inconclusive") assert.fail("Esperado completo.");
	assert.equal(result.status, "complete");
	assert.ok(approxEqual(result.output.beforeWeights.ATIVO1 ?? 0, 0.8));
	assert.ok(approxEqual(result.output.beforeWeights.ATIVO2 ?? 0, 0.2));

	const candidate = result.output.candidates[0];
	assert.ok(candidate);
	assert.ok(approxEqual(candidate.afterWeights.ATIVO1 ?? 0, 0.64));
	assert.ok(approxEqual(candidate.afterWeights.ATIVO2 ?? 0, 0.36));

	// Cálculo independente dos momentos amostrais (n - 1) sobre r1 e r2 para pesos 0.64 / 0.36.
	const mean1 = mean(r1);
	const mean2 = mean(r2);
	let sumSq1 = 0;
	let sumSq2 = 0;
	let sumProd = 0;
	for (let index = 0; index < r1.length; index += 1) {
		const delta1 = (r1[index] ?? 0) - mean1;
		const delta2 = (r2[index] ?? 0) - mean2;
		sumSq1 += delta1 * delta1;
		sumSq2 += delta2 * delta2;
		sumProd += delta1 * delta2;
	}
	const var1 = sumSq1 / (r1.length - 1);
	const var2 = sumSq2 / (r2.length - 1);
	const cov12 = sumProd / (r1.length - 1);

	const w1After = 0.64;
	const w2After = 0.36;
	const marginal1After = w1After * var1 + w2After * cov12;
	const marginal2After = w1After * cov12 + w2After * var2;
	const portVarAfter = w1After * marginal1After + w2After * marginal2After;
	const expectedVolAfter = Math.sqrt(portVarAfter) * Math.sqrt(12);
	const expectedRc1After = (w1After * marginal1After) / portVarAfter;
	const expectedRc2After = (w2After * marginal2After) / portVarAfter;

	assert.ok(approxEqual(candidate.volatilityAfter ?? Number.NaN, expectedVolAfter));
	assert.deepEqual(Object.keys(candidate.riskContributionsAfter ?? {}), ["ATIVO1", "ATIVO2"]);
	assert.ok(approxEqual(candidate.riskContributionsAfter?.ATIVO1 ?? Number.NaN, expectedRc1After));
	assert.ok(approxEqual(candidate.riskContributionsAfter?.ATIVO2 ?? Number.NaN, expectedRc2After));
	assert.ok(!approxEqual(candidate.volatilityAfter ?? Number.NaN, candidate.volatilityBefore ?? 0));
	assertNoPrescriptiveWording(result.notVerified, result.findings);
});
