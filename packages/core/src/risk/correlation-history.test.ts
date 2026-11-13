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
