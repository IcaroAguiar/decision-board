import assert from "node:assert/strict";
import test from "node:test";
import {
	addMonths,
	approxEqual,
	createMonthlySeries,
	known,
	missing,
	runCorrelationTest,
} from "../index.js";
import {
	assertNoPrescriptiveWording,
	createLcg,
	makeExactCorrelatedReturns,
	officialSource,
	toSeries,
} from "./fixtures.test.js";

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
