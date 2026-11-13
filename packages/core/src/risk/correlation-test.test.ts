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

test("returns inconclusive with null output when no window is complete or essential inputs are missing", () => {
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
	assert.equal(shortResult.status, "inconclusive");
	assert.equal(shortResult.output, null);
	assertNoPrescriptiveWording(shortResult.notVerified, shortResult.findings);

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

test("handles adding contribution to a candidate that is already in holdings", () => {
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
	const candidate = result.output.candidates[0];
	assert.ok(candidate);
	assert.deepEqual(Object.keys(candidate.riskContributionsAfter ?? {}), ["ATIVO1", "ATIVO2"]);
	const sumAfter = Object.values(candidate.riskContributionsAfter ?? {}).reduce((a, b) => a + b, 0);
	assert.ok(approxEqual(sumAfter, 1));
	assertNoPrescriptiveWording(result.notVerified, result.findings);
});
