import assert from "node:assert/strict";
import test from "node:test";
import {
	addMonths,
	approxEqual,
	createMonthlySeries,
	known,
	type MonthlySeries,
	mean,
	methodIds,
	missing,
	runCorrelationTest,
	type SourceRef,
	sampleStdev,
} from "../index.js";

const officialSource: SourceRef = {
	id: "b3-synthetic",
	label: "Posição B3 Sintética",
	asOf: "2026-10-31",
	official: true,
};

const unofficialSource: SourceRef = {
	id: "optional-provider",
	label: "Provedor Opcional Sintético",
	asOf: "2026-10-31",
	official: false,
};

function createLcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

function toSeries(
	endMonth: string,
	values: readonly number[],
	source: SourceRef = officialSource,
): MonthlySeries {
	const startMonth = addMonths(endMonth, 1 - values.length);
	return createMonthlySeries(
		values.map((value, index) => ({
			month: addMonths(startMonth, index),
			value: known(value, "observed", source),
		})),
	);
}

function makeExactCorrelatedReturns(
	baseReturns: readonly number[],
	targetRho: number,
	targetMonthlySd: number,
	seed: number,
): number[] {
	const rand = createLcg(seed);
	const rawZ = Array.from({ length: baseReturns.length }, () => (rand() - 0.5) * 0.1);
	const meanX = mean(baseReturns);
	const meanZ = mean(rawZ);
	const xc = baseReturns.map((x) => x - meanX);
	const zc = rawZ.map((z) => z - meanZ);

	let dotXZ = 0;
	let dotXX = 0;
	for (let i = 0; i < baseReturns.length; i += 1) {
		const xi = xc[i] ?? 0;
		const zi = zc[i] ?? 0;
		dotXZ += xi * zi;
		dotXX += xi * xi;
	}
	const proj = dotXZ / dotXX;
	const orthogonal = zc.map((zi, i) => zi - proj * (xc[i] ?? 0));

	const sdX = sampleStdev(baseReturns);
	const sdU = sampleStdev(orthogonal);
	const orthoWeight = Math.sqrt(1 - targetRho * targetRho);
	return xc.map(
		(xi, i) =>
			0.008 +
			targetMonthlySd * (targetRho * (xi / sdX) + orthoWeight * ((orthogonal[i] ?? 0) / sdU)),
	);
}

function assertNoPrescriptiveWording(
	notVerified: readonly string[],
	findings: readonly { message: string }[],
): void {
	const forbidden = /compr|vend|recomend/i;
	for (const note of notVerified) {
		assert.equal(forbidden.test(note), false, `Texto prescritivo em notVerified: ${note}`);
	}
	for (const finding of findings) {
		assert.equal(
			forbidden.test(finding.message),
			false,
			`Texto prescritivo em finding: ${finding.message}`,
		);
	}
}

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

test("R3 acceptance 3: short candidate series yields partial status and null correlation for the unfulfilled window", () => {
	const endMonth = "2026-10";
	const rand = createLcg(777);
	const rHolding = Array.from({ length: 58 }, () => 0.004 + (rand() - 0.5) * 0.07);
	const rShortCandidate = Array.from({ length: 36 }, () => 0.003 + (rand() - 0.5) * 0.06);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "CART11",
				value: known(100_000, "observed", officialSource),
				returns: toSeries(endMonth, rHolding),
			},
		],
		candidates: [{ key: "NOVO11", returns: toSeries(endMonth, rShortCandidate) }],
		contribution: known(10_000, "informed", officialSource),
	});

	if (result.status === "inconclusive") assert.fail("Esperado resultado parcial com saída.");
	assert.equal(result.status, "partial");
	assert.ok(result.notVerified.includes("Histórico menor que a janela de 58 meses para NOVO11"));
	assertNoPrescriptiveWording(result.notVerified, result.findings);

	const candidate = result.output.candidates[0];
	assert.ok(candidate);
	assert.equal(candidate.longestCompleteWindow, 30);

	const win30 = candidate.windows.find((w) => w.window === 30);
	const win58 = candidate.windows.find((w) => w.window === 58);
	assert.ok(win30 && win30.status === "complete");
	assert.equal(typeof win30.correlation, "number");
	assert.ok(win58 && win58.status === "partial");
	assert.equal(win58.correlation, null);
	assert.equal(win58.overlap, 36);
	assert.equal(win58.reason, "Histórico menor que a janela de 58 meses para NOVO11");

	// Mesmo com janela de 58 parcial, a correlação móvel de 24 meses sobre 36 meses (13 observações) aparece.
	assert.ok(candidate.rollingCorrelation !== null);
	assert.equal(candidate.rollingCorrelation.observations, 13);
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

test("marks partial and lists key when a holding balance is missing", () => {
	const endMonth = "2026-10";
	const rand = createLcg(314);
	const r1 = Array.from({ length: 30 }, () => 0.005 + (rand() - 0.5) * 0.06);
	const r2 = Array.from({ length: 30 }, () => 0.002 + (rand() - 0.5) * 0.05);
	const rCand = Array.from({ length: 30 }, () => 0.004 + (rand() - 0.5) * 0.06);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "BOVA11",
				value: known(50_000, "observed", officialSource),
				returns: toSeries(endMonth, r1),
			},
			{ key: "SMAL11", value: missing("Saldo B3 indisponível"), returns: toSeries(endMonth, r2) },
		],
		candidates: [{ key: "IVVB11", returns: toSeries(endMonth, rCand) }],
		contribution: known(10_000, "informed", officialSource),
		assumptions: { windows: [30] },
	});

	if (result.status === "inconclusive") assert.fail("Esperado parcial.");
	assert.equal(result.status, "partial");
	assertNoPrescriptiveWording(result.notVerified, result.findings);
	assert.deepEqual(result.output.missingHoldingKeys, ["SMAL11"]);
	assert.ok(result.findings.some((f) => f.subject === "SMAL11" && f.severity === "warning"));
	assert.ok(result.notVerified.some((note) => note.includes("SMAL11")));
});

test("returns partial on short history when worst months are computable, and inconclusive when nothing is computable or essential inputs are missing", () => {
	const endMonth = "2026-10";
	const rand = createLcg(55);
	const rShort = Array.from({ length: 12 }, () => 0.003 + (rand() - 0.5) * 0.05);

	const shortResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "A1",
				value: known(10_000, "observed", officialSource),
				returns: toSeries(endMonth, rShort),
			},
		],
		candidates: [{ key: "C1", returns: toSeries(endMonth, rShort) }],
		contribution: known(1_000, "informed", officialSource),
	});
	assert.equal(shortResult.status, "partial");
	const shortCandidate = shortResult.output.candidates[0];
	assert.ok(shortCandidate);
	assert.equal(shortCandidate.classification, "inconclusivo");
	assert.equal(shortCandidate.longestCompleteWindow, null);
	assert.equal(shortCandidate.rollingCorrelation, null);
	assert.equal(shortCandidate.worstMonths.length, 5);
	for (const windowResult of shortCandidate.windows) {
		assert.equal(windowResult.status, "partial");
		assert.equal(windowResult.correlation, null);
	}
	assertNoPrescriptiveWording(shortResult.notVerified, shortResult.findings);

	const emptyHistoryResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "A1",
				value: known(10_000, "observed", officialSource),
				returns: createMonthlySeries([]),
			},
		],
		candidates: [{ key: "C1", returns: createMonthlySeries([]) }],
		contribution: known(1_000, "informed", officialSource),
	});
	assert.equal(emptyHistoryResult.status, "inconclusive");
	assert.equal(emptyHistoryResult.output, null);
	assertNoPrescriptiveWording(emptyHistoryResult.notVerified, emptyHistoryResult.findings);

	const missingContributionResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "A1",
				value: known(10_000, "observed", officialSource),
				returns: toSeries(endMonth, rShort),
			},
		],
		candidates: [{ key: "C1", returns: toSeries(endMonth, rShort) }],
		contribution: missing("Caixa mensal não declarado"),
		assumptions: { windows: [12] },
	});
	assert.equal(missingContributionResult.status, "inconclusive");
	assert.equal(missingContributionResult.output, null);
	assertNoPrescriptiveWording(
		missingContributionResult.notVerified,
		missingContributionResult.findings,
	);
});

test("keeps partial status with output and 1 rolling observation for 24 aligned months", () => {
	const endMonth = "2026-10";
	const rand = createLcg(612);
	const rHolding = Array.from({ length: 24 }, () => 0.004 + (rand() - 0.5) * 0.06);
	const rCandidate = makeExactCorrelatedReturns(rHolding, -0.5, 0.03, 613);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "CART11",
				value: known(100_000, "observed", officialSource),
				returns: toSeries(endMonth, rHolding),
			},
		],
		candidates: [{ key: "CAND24", returns: toSeries(endMonth, rCandidate) }],
		contribution: known(20_000, "informed", officialSource),
	});

	assert.equal(result.status, "partial");
	const candidate = result.output.candidates[0];
	assert.ok(candidate);
	assert.equal(candidate.classification, "inconclusivo");
	assert.equal(candidate.longestCompleteWindow, null);

	const win30 = candidate.windows.find((w) => w.window === 30);
	const win58 = candidate.windows.find((w) => w.window === 58);
	assert.ok(win30 && win30.status === "partial" && win30.correlation === null);
	assert.ok(win58 && win58.status === "partial" && win58.correlation === null);

	assert.ok(candidate.rollingCorrelation !== null);
	assert.equal(candidate.rollingCorrelation.windowMonths, 24);
	assert.equal(candidate.rollingCorrelation.observations, 1);
	assert.ok(
		approxEqual(candidate.rollingCorrelation.min, -0.5, { relative: 1e-9, absolute: 1e-9 }),
	);
	assert.ok(
		approxEqual(candidate.rollingCorrelation.max, -0.5, { relative: 1e-9, absolute: 1e-9 }),
	);
	assertNoPrescriptiveWording(result.notVerified, result.findings);
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

test("handles zero variance without aborting: constant candidate, constant rolling sub-window, variance-neutralizing contribution, and mixed batch", () => {
	const endMonth = "2026-10";
	const rand = createLcg(4242);
	const rPortfolio = Array.from({ length: 30 }, () => 0.005 + (rand() - 0.5) * 0.08);

	// 1. Candidato constante (variância nula em toda a série)
	const constantReturns = Array.from({ length: 30 }, () => 0.008);
	const constResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "BOLSA11",
				value: known(80_000, "observed", officialSource),
				returns: toSeries(endMonth, rPortfolio),
			},
		],
		candidates: [{ key: "CAIXA_FIXO", returns: toSeries(endMonth, constantReturns) }],
		contribution: known(20_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 5 },
	});
	assert.equal(constResult.status, "partial");
	const constCandidate = constResult.output.candidates[0];
	assert.ok(constCandidate);
	assert.equal(constCandidate.rollingCorrelation, null);
	assert.equal(constCandidate.windows[0]?.status, "partial");
	assert.equal(constCandidate.windows[0]?.correlation, null);
	assert.ok((constCandidate.volatilityBefore ?? 0) > 0);
	assert.ok((constCandidate.volatilityAfter ?? 0) < (constCandidate.volatilityBefore ?? 0));
	assert.ok(constCandidate.riskContributionsBefore !== null);
	assert.ok(constCandidate.riskContributionsAfter !== null);
	assert.ok(
		constResult.findings.some(
			(finding) => finding.subject === "CAIXA_FIXO" && finding.severity === "warning",
		),
	);
	assert.ok(constResult.notVerified.some((note) => note.includes("CAIXA_FIXO")));
	assertNoPrescriptiveWording(constResult.notVerified, constResult.findings);

	// 2. Subjanela móvel constante (24 primeiros meses constantes, 6 últimos variáveis)
	const partialConstReturns = [
		...Array.from({ length: 24 }, () => 0.004),
		0.02,
		-0.015,
		0.03,
		-0.02,
		0.01,
		-0.005,
	];
	const rollingSubResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "BOLSA11",
				value: known(80_000, "observed", officialSource),
				returns: toSeries(endMonth, rPortfolio),
			},
		],
		candidates: [{ key: "SUB_CONST", returns: toSeries(endMonth, partialConstReturns) }],
		contribution: known(20_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 5 },
	});
	assert.equal(rollingSubResult.status, "partial");
	const subCandidate = rollingSubResult.output.candidates[0];
	assert.ok(subCandidate);
	assert.equal(subCandidate.windows[0]?.status, "complete");
	assert.ok(subCandidate.rollingCorrelation !== null);
	// 30 meses com janela de 24 geram 7 subjanelas; a primeira é constante e as 6 restantes são válidas.
	assert.equal(subCandidate.rollingCorrelation.observations, 6);
	assert.ok(
		rollingSubResult.findings.some(
			(finding) => finding.subject === "SUB_CONST" && finding.severity === "warning",
		),
	);
	assertNoPrescriptiveWording(rollingSubResult.notVerified, rollingSubResult.findings);

	// 3. Aporte que neutraliza exatamente a volatilidade da carteira (variância posterior nula)
	const neutralizingReturns = rPortfolio.map((value) => -value);
	const neutralResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "BOLSA11",
				value: known(50_000, "observed", officialSource),
				returns: toSeries(endMonth, rPortfolio),
			},
		],
		candidates: [{ key: "ESPELHO11", returns: toSeries(endMonth, neutralizingReturns) }],
		contribution: known(50_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 5 },
	});
	assert.equal(neutralResult.status, "partial");
	const neutralCandidate = neutralResult.output.candidates[0];
	assert.ok(neutralCandidate);
	assert.equal(neutralCandidate.classification, "reduz risco");
	assert.ok((neutralCandidate.volatilityBefore ?? 0) > 0);
	assert.equal(neutralCandidate.volatilityAfter, 0);
	assert.ok(neutralCandidate.riskContributionsBefore !== null);
	assert.equal(neutralCandidate.riskContributionsAfter, null);
	assert.ok(approxEqual(neutralCandidate.windows[0]?.correlation ?? 0, -1));
	assert.ok(
		neutralResult.findings.some(
			(finding) => finding.subject === "ESPELHO11" && finding.severity === "warning",
		),
	);
	assertNoPrescriptiveWording(neutralResult.notVerified, neutralResult.findings);

	// 4. Lote misto: um candidato degenerado não impede o candidato válido de manter seus números
	const validReturns = makeExactCorrelatedReturns(rPortfolio, -0.6, 0.03, 5151);
	const batchResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "BOLSA11",
				value: known(80_000, "observed", officialSource),
				returns: toSeries(endMonth, rPortfolio),
			},
		],
		candidates: [
			{ key: "CAIXA_FIXO", returns: toSeries(endMonth, constantReturns) },
			{ key: "VALIDO11", returns: toSeries(endMonth, validReturns) },
		],
		contribution: known(20_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 5 },
	});
	assert.equal(batchResult.status, "partial");
	const batchConst = batchResult.output.candidates[0];
	const batchValid = batchResult.output.candidates[1];
	assert.ok(batchConst && batchValid);
	assert.equal(batchConst.windows[0]?.correlation, null);
	assert.equal(batchValid.windows[0]?.status, "complete");
	assert.ok(
		approxEqual(batchValid.windows[0]?.correlation ?? Number.NaN, -0.6, {
			relative: 1e-9,
			absolute: 1e-9,
		}),
	);
	assert.equal(batchValid.classification, "reduz risco");
	assert.equal(batchValid.longestCompleteWindow, 30);
	assert.ok(batchValid.rollingCorrelation !== null);
	assert.equal(batchValid.rollingCorrelation.observations, 7);
	assertNoPrescriptiveWording(batchResult.notVerified, batchResult.findings);
});

test("selects worst months from the portfolio series and keeps adverse month with null candidateReturn when candidate data is missing", () => {
	const endMonth = "2026-10";
	const rand = createLcg(7070);
	// 60 meses para a carteira, com o pior mês (-90%) fora dos últimos 58 meses do candidato.
	const rPortfolio = [
		-0.9,
		0.01,
		...Array.from({ length: 58 }, () => 0.005 + (rand() - 0.5) * 0.06),
	];
	const rCandidate58 = makeExactCorrelatedReturns(rPortfolio.slice(2), -0.45, 0.03, 7071);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "PORT11",
				value: known(100_000, "observed", officialSource),
				returns: toSeries(endMonth, rPortfolio),
			},
		],
		candidates: [{ key: "RECENTE11", returns: toSeries(endMonth, rCandidate58) }],
		contribution: known(20_000, "informed", officialSource),
		assumptions: { windows: [30, 58], rollingWindow: 24, worstMonths: 5 },
	});

	assert.equal(result.status, "partial");
	const candidate = result.output.candidates[0];
	assert.ok(candidate);
	// As janelas de 30 e 58 meses continuam completas, mas a ausência no pior mês marca o resultado como parcial.
	assert.equal(candidate.longestCompleteWindow, 58);

	const worstEntry = candidate.worstMonths[0];
	assert.ok(worstEntry);
	assert.equal(worstEntry.month, addMonths(endMonth, -59));
	assert.equal(worstEntry.portfolioReturn, -0.9);
	assert.equal(worstEntry.candidateReturn, null);
	assert.ok(worstEntry.reason.includes("RECENTE11"));
	assert.ok(
		result.notVerified.some(
			(note) => note.includes(worstEntry.month) && note.includes("RECENTE11"),
		),
	);
	assert.ok(
		result.findings.some(
			(finding) =>
				finding.subject === "RECENTE11" &&
				finding.severity === "warning" &&
				finding.message.includes(worstEntry.month),
		),
	);
	assertNoPrescriptiveWording(result.notVerified, result.findings);
});

test("ignores known zero-balance holdings without history and preserves computable portfolio results", () => {
	const endMonth = "2026-10";
	const rand = createLcg(8181);
	const r1 = Array.from({ length: 30 }, () => 0.004 + (rand() - 0.5) * 0.08);
	const rCand = makeExactCorrelatedReturns(r1, -0.5, 0.03, 8182);

	const baseInput = {
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: "v1",
		holdings: [
			{
				key: "ATIVO1",
				value: known(100_000, "observed", officialSource),
				returns: toSeries(endMonth, r1),
			},
		],
		candidates: [{ key: "HEDGE11", returns: toSeries(endMonth, rCand) }],
		contribution: known(25_000, "informed", officialSource),
		assumptions: { windows: [30], rollingWindow: 24, worstMonths: 5 },
	};

	const baseResult = runCorrelationTest(baseInput);
	const withZeroResult = runCorrelationTest({
		...baseInput,
		holdings: [
			...baseInput.holdings,
			{
				key: "ZERADO11",
				value: known(0, "observed", officialSource),
				returns: createMonthlySeries([]),
			},
		],
	});

	assert.equal(baseResult.status, "complete");
	assert.equal(withZeroResult.status, baseResult.status);
	assert.deepEqual(withZeroResult.output.candidates, baseResult.output.candidates);
	assert.deepEqual(withZeroResult.notVerified, baseResult.notVerified);
	assert.deepEqual(withZeroResult.findings, baseResult.findings);
	assert.equal(withZeroResult.output.beforeWeights.ZERADO11, 0);
	assertNoPrescriptiveWording(withZeroResult.notVerified, withZeroResult.findings);
});

test("returns inconclusive when 58-month portfolio is tested against empty or non-overlapping candidate histories, and partial in mixed batch preserving valid candidate numbers", () => {
	const endMonth = "2026-10";
	const rand = createLcg(9191);
	const rPortfolio = Array.from({ length: 58 }, () => 0.004 + (rand() - 0.5) * 0.08);
	const validReturns = makeExactCorrelatedReturns(rPortfolio, -0.55, 0.025, 9292);
	const oldNonOverlappingEnd = addMonths(endMonth, -58);
	const oldCandidateReturns = Array.from({ length: 58 }, () => 0.005 + (rand() - 0.5) * 0.07);

	const portfolioHoldings = [
		{
			key: "PORT11",
			value: known(100_000, "observed", officialSource),
			returns: toSeries(endMonth, rPortfolio),
		},
	];
	const contribution = known(25_000, "informed", officialSource);

	// 1. Candidato vazio com carteira de 58 meses -> inconclusivo (nenhuma métrica computável)
	const emptyCandidateResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: "v1",
		holdings: portfolioHoldings,
		candidates: [{ key: "VAZIO11", returns: createMonthlySeries([]) }],
		contribution,
	});
	assert.equal(emptyCandidateResult.status, "inconclusive");
	assert.equal(emptyCandidateResult.output, null);
	assert.ok(
		emptyCandidateResult.findings.some(
			(finding) => finding.code === "NO_COMPUTABLE_METRICS" && finding.severity === "blocked",
		),
	);
	assertNoPrescriptiveWording(emptyCandidateResult.notVerified, emptyCandidateResult.findings);

	// 2. Históricos sem sobreposição com a carteira de 58 meses -> inconclusivo
	const nonOverlappingResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: "v1",
		holdings: portfolioHoldings,
		candidates: [{ key: "ANTIGO11", returns: toSeries(oldNonOverlappingEnd, oldCandidateReturns) }],
		contribution,
	});
	assert.equal(nonOverlappingResult.status, "inconclusive");
	assert.equal(nonOverlappingResult.output, null);
	assert.ok(
		nonOverlappingResult.findings.some(
			(finding) => finding.code === "NO_COMPUTABLE_METRICS" && finding.severity === "blocked",
		),
	);
	assertNoPrescriptiveWording(nonOverlappingResult.notVerified, nonOverlappingResult.findings);

	// 3. Lote misto (um válido + um vazio) -> parcial, e o candidato válido preserva todos os números
	const soloValidResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: "v1",
		holdings: portfolioHoldings,
		candidates: [{ key: "HEDGE11", returns: toSeries(endMonth, validReturns) }],
		contribution,
	});
	if (soloValidResult.status === "inconclusive") assert.fail("Esperado resultado completo.");
	const soloValidCandidate = soloValidResult.output.candidates[0];
	assert.ok(soloValidCandidate);

	const mixedResult = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: "v1",
		holdings: portfolioHoldings,
		candidates: [
			{ key: "HEDGE11", returns: toSeries(endMonth, validReturns) },
			{ key: "VAZIO11", returns: createMonthlySeries([]) },
		],
		contribution,
	});
	assert.equal(mixedResult.status, "partial");
	const mixedValidCandidate = mixedResult.output.candidates[0];
	const mixedEmptyCandidate = mixedResult.output.candidates[1];
	assert.ok(mixedValidCandidate && mixedEmptyCandidate);

	assert.deepEqual(mixedValidCandidate, soloValidCandidate);
	assert.equal(mixedValidCandidate.classification, "reduz risco");
	assert.equal(mixedValidCandidate.longestCompleteWindow, 58);
	assert.ok(mixedValidCandidate.rollingCorrelation !== null);
	assert.equal(mixedValidCandidate.rollingCorrelation.observations, 35);

	assert.equal(mixedEmptyCandidate.classification, "inconclusivo");
	assert.equal(mixedEmptyCandidate.longestCompleteWindow, null);
	assert.equal(mixedEmptyCandidate.rollingCorrelation, null);
	assert.ok(mixedEmptyCandidate.windows.every((windowResult) => windowResult.correlation === null));
	assert.ok(mixedEmptyCandidate.worstMonths.every((entry) => entry.candidateReturn === null));
	assertNoPrescriptiveWording(mixedResult.notVerified, mixedResult.findings);
});

test("handles an explicitly missing Datum inside candidate history on a portfolio worst month via alignSeries", () => {
	const endMonth = "2026-10";
	const rand = createLcg(9393);
	const rPortfolio = Array.from({ length: 58 }, () => 0.004 + (rand() - 0.5) * 0.04);
	// Define o pior mês da carteira dentro dos primeiros 28 meses (fora da janela de 30 meses).
	const worstIndex = 10;
	const worstMonth = addMonths(endMonth, worstIndex - (rPortfolio.length - 1));
	rPortfolio[worstIndex] = -0.35;

	const rawCandidateReturns = makeExactCorrelatedReturns(rPortfolio, -0.5, 0.03, 9494);
	const startMonth = addMonths(endMonth, 1 - rPortfolio.length);
	const missingReason = "Pregão sem negociação para o ativo no mês";
	const candidateSeries = createMonthlySeries(
		rawCandidateReturns.map((value, index) => {
			const month = addMonths(startMonth, index);
			return {
				month,
				value:
					index === worstIndex ? missing(missingReason) : known(value, "observed", officialSource),
			};
		}),
	);

	const result = runCorrelationTest({
		asOf: "2026-10-31",
		endMonth,
		strategyVersion: null,
		holdings: [
			{
				key: "PORT11",
				value: known(100_000, "observed", officialSource),
				returns: toSeries(endMonth, rPortfolio),
			},
		],
		candidates: [{ key: "GAP11", returns: candidateSeries }],
		contribution: known(20_000, "informed", officialSource),
		assumptions: { windows: [30, 58], rollingWindow: 24, worstMonths: 5 },
	});

	assert.equal(result.status, "partial");
	const candidate = result.output.candidates[0];
	assert.ok(candidate);
	assert.equal(candidate.longestCompleteWindow, 30);

	const win30 = candidate.windows.find((w) => w.window === 30);
	const win58 = candidate.windows.find((w) => w.window === 58);
	assert.ok(win30 && win30.status === "complete");
	assert.ok(win58 && win58.status === "partial");
	assert.equal(win58.overlap, 57);

	const worstEntry = candidate.worstMonths[0];
	assert.ok(worstEntry);
	assert.equal(worstEntry.month, worstMonth);
	assert.equal(worstEntry.portfolioReturn, -0.35);
	assert.equal(worstEntry.candidateReturn, null);
	assert.ok(worstEntry.reason.includes("GAP11"));
	assert.ok(worstEntry.reason.includes(worstMonth));

	const otherWorstEntries = candidate.worstMonths.slice(1);
	assert.equal(otherWorstEntries.length, 4);
	for (const entry of otherWorstEntries) {
		assert.equal(typeof entry.candidateReturn, "number");
	}

	assert.ok(result.notVerified.includes(missingReason));
	assert.ok(result.notVerified.some((note) => note.includes(worstMonth) && note.includes("GAP11")));
	assert.ok(
		result.findings.some(
			(finding) =>
				finding.code === "MISSING_WORST_MONTH_CANDIDATE_RETURN" &&
				finding.subject === "GAP11" &&
				finding.severity === "warning" &&
				finding.message.includes(worstMonth),
		),
	);
	assertNoPrescriptiveWording(result.notVerified, result.findings);
});
