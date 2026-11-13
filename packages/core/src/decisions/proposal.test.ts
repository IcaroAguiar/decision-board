import assert from "node:assert/strict";
import test from "node:test";
import {
	correlationTestSubjects,
	evaluateProposal,
	known,
	methodIds,
	missing,
	recordDecision,
	reviseStrategy,
	runCorrelationTest,
	toAnalysisRef,
	versionLabel,
} from "../index.js";
import {
	buildPreferences,
	buildStrategy,
	buildSyntheticSeries,
	makeItem,
	makeProposal,
	makeRef,
	syntheticSource,
} from "./fixtures.test.js";

test("R11: proposta de renda variável exige R3 cobrindo cada ativo alocado ou dispensa por ativo", () => {
	const strategy = buildStrategy();
	const person = { kind: "person", confirmedInSession: true } as const;

	const withoutR3 = makeProposal();
	const blockedEval = evaluateProposal(withoutR3, strategy);
	assert.equal(blockedEval.approvable, false);
	assert.deepEqual(blockedEval.findings, [
		{
			code: "missing_r3_correlation_test",
			severity: "blocked",
			subject: "asset-fii-1",
			message:
				"Revisão necessária: alocação em renda variável (XPLG11) sem teste de correlação (R3) para o ativo.",
		},
	]);
	assert.throws(
		() =>
			recordDecision({
				proposal: withoutR3,
				outcome: "approved",
				reason: "Tentativa sem R3",
				decidedAt: "2026-02-05",
				strategy,
				actor: person,
			}),
		/bloqueada/,
	);

	const withInconclusiveR3 = makeProposal({
		analyses: [
			makeRef(),
			makeRef({
				id: "ana-r3-inc",
				method: { id: methodIds.correlationTest, version: "1.0.0" },
				status: "inconclusive",
				subjects: [],
			}),
		],
	});
	const inconclusiveEval = evaluateProposal(withInconclusiveR3, strategy);
	assert.equal(inconclusiveEval.approvable, false);
	assert.equal(
		inconclusiveEval.findings.some((finding) => finding.severity === "warning"),
		true,
	);

	const withPartialR3 = makeProposal({
		analyses: [
			makeRef(),
			makeRef({
				id: "ana-r3-partial",
				method: { id: methodIds.correlationTest, version: "1.1.0" },
				status: "partial",
				subjects: ["asset-fii-1"],
			}),
		],
	});
	assert.equal(evaluateProposal(withPartialR3, strategy).approvable, true);

	const r3ForAnotherAsset = makeProposal({
		items: [makeItem({ assetId: "asset-c", ticker: "HGLG11" })],
		analyses: [
			makeRef(),
			makeRef({
				id: "ana-r3-b",
				method: { id: methodIds.correlationTest, version: "1.0.0" },
				status: "complete",
				subjects: ["asset-b"],
			}),
		],
	});
	const r3AnotherEval = evaluateProposal(r3ForAnotherAsset, strategy);
	assert.equal(r3AnotherEval.approvable, false);
	assert.deepEqual(
		r3AnotherEval.findings
			.filter((finding) => finding.code === "missing_r3_correlation_test")
			.map((finding) => finding.subject),
		["asset-c"],
	);

	const mixedItems = makeProposal({
		items: [
			makeItem({ assetId: "asset-b", ticker: "XPLG11" }),
			makeItem({ assetId: "asset-c", ticker: "HGLG11" }),
		],
		analyses: [
			makeRef(),
			makeRef({
				id: "ana-r3-b",
				method: { id: methodIds.correlationTest, version: "1.0.0" },
				status: "complete",
				subjects: ["asset-b"],
			}),
		],
	});
	const mixedEval = evaluateProposal(mixedItems, strategy);
	assert.equal(mixedEval.approvable, false);
	assert.deepEqual(
		mixedEval.findings
			.filter((finding) => finding.code === "missing_r3_correlation_test")
			.map((finding) => ({ severity: finding.severity, subject: finding.subject })),
		[{ severity: "blocked", subject: "asset-c" }],
	);

	const twoUncovered = makeProposal({
		items: [
			makeItem({ assetId: "asset-b", ticker: "XPLG11" }),
			makeItem({ assetId: "asset-c", ticker: "HGLG11" }),
		],
	});
	const twoUncoveredEval = evaluateProposal(twoUncovered, strategy);
	assert.equal(twoUncoveredEval.approvable, false);
	assert.deepEqual(
		twoUncoveredEval.findings
			.filter((finding) => finding.code === "missing_r3_correlation_test")
			.map((finding) => finding.subject),
		["asset-b", "asset-c"],
	);

	const withBlankWaiver = makeProposal({
		justifications: [{ code: "r3-waived", reason: "   ", subject: "asset-fii-1" }],
	});
	assert.equal(evaluateProposal(withBlankWaiver, strategy).approvable, false);

	const withNullSubjectWaiver = makeProposal({
		justifications: [
			{
				code: "r3-waived",
				reason: "Série histórica indisponível; posição pequena.",
				subject: null,
			},
		],
	});
	assert.equal(evaluateProposal(withNullSubjectWaiver, strategy).approvable, false);

	const withOtherSubjectWaiver = makeProposal({
		items: [makeItem({ assetId: "asset-c", ticker: "HGLG11" })],
		justifications: [
			{
				code: "r3-waived",
				reason: "Série histórica indisponível; posição pequena.",
				subject: "asset-b",
			},
		],
	});
	const otherWaiverEval = evaluateProposal(withOtherSubjectWaiver, strategy);
	assert.equal(otherWaiverEval.approvable, false);
	assert.deepEqual(
		otherWaiverEval.findings.map((finding) => finding.subject),
		["asset-c"],
	);

	const withValidWaiver = makeProposal({
		justifications: [
			{
				code: "r3-waived",
				reason: "Série histórica indisponível; posição pequena.",
				subject: "asset-fii-1",
			},
		],
	});
	const waivedEval = evaluateProposal(withValidWaiver, strategy);
	assert.equal(waivedEval.approvable, true);
});

test("R11: integra runCorrelationTest real e correlationTestSubjects em cenários completo, parcial e inconclusivo", () => {
	const strategy = buildStrategy();
	const endMonth = "2026-01";
	const holdingReturns = buildSyntheticSeries(endMonth, [0.02, -0.01, 0.03, -0.015, 0.025, 0.01]);
	const candidateBReturns = buildSyntheticSeries(
		endMonth,
		[-0.01, 0.02, -0.015, 0.03, -0.01, 0.015],
	);
	const candidateCShortReturns = buildSyntheticSeries(endMonth, [0.01, -0.02, 0.025]);
	const candidateCFullReturns = buildSyntheticSeries(
		endMonth,
		[0.015, 0.005, -0.02, 0.025, 0.01, -0.005],
	);

	const partialR3Result = runCorrelationTest({
		asOf: "2026-02-01",
		endMonth,
		strategyVersion: versionLabel(strategy),
		holdings: [
			{
				key: "asset-holding",
				value: known(10_000, "observed", syntheticSource),
				returns: holdingReturns,
			},
		],
		candidates: [
			{ key: "asset-b", returns: candidateBReturns },
			{ key: "asset-c", returns: candidateCShortReturns },
		],
		contribution: known(1_000, "informed", syntheticSource),
		assumptions: { windows: [6], rollingWindow: 3, worstMonths: 2 },
	});
	assert.equal(partialR3Result.status, "partial");
	assert.deepEqual(correlationTestSubjects(partialR3Result), ["asset-b"]);

	const partialR3Ref = toAnalysisRef(
		"ana-r3-real-partial",
		partialR3Result,
		correlationTestSubjects(partialR3Result),
	);
	assert.deepEqual(partialR3Ref.subjects, ["asset-b"]);

	const mixedWithRealPartial = makeProposal({
		items: [
			makeItem({ assetId: "asset-b", ticker: "XPLG11" }),
			makeItem({ assetId: "asset-c", ticker: "HGLG11" }),
		],
		analyses: [makeRef(), partialR3Ref],
	});
	const mixedEval = evaluateProposal(mixedWithRealPartial, strategy);
	assert.equal(mixedEval.approvable, false);
	assert.deepEqual(
		mixedEval.findings
			.filter((finding) => finding.code === "missing_r3_correlation_test")
			.map((finding) => finding.subject),
		["asset-c"],
	);

	const onlyCoveredEval = evaluateProposal(
		makeProposal({
			items: [makeItem({ assetId: "asset-b", ticker: "XPLG11" })],
			analyses: [makeRef(), partialR3Ref],
		}),
		strategy,
	);
	assert.equal(onlyCoveredEval.approvable, true);

	const completeR3Result = runCorrelationTest({
		asOf: "2026-02-01",
		endMonth,
		strategyVersion: versionLabel(strategy),
		holdings: [
			{
				key: "asset-holding",
				value: known(10_000, "observed", syntheticSource),
				returns: holdingReturns,
			},
		],
		candidates: [
			{ key: "asset-b", returns: candidateBReturns },
			{ key: "asset-c", returns: candidateCFullReturns },
		],
		contribution: known(1_000, "informed", syntheticSource),
		assumptions: { windows: [6], rollingWindow: 3, worstMonths: 2 },
	});
	assert.equal(completeR3Result.status, "complete");
	assert.deepEqual(correlationTestSubjects(completeR3Result), ["asset-b", "asset-c"]);
	const completeR3Ref = toAnalysisRef(
		"ana-r3-real-complete",
		completeR3Result,
		correlationTestSubjects(completeR3Result),
	);
	assert.equal(
		evaluateProposal(
			makeProposal({
				items: [
					makeItem({ assetId: "asset-b", ticker: "XPLG11" }),
					makeItem({ assetId: "asset-c", ticker: "HGLG11" }),
				],
				analyses: [makeRef(), completeR3Ref],
			}),
			strategy,
		).approvable,
		true,
	);

	const inconclusiveR3Result = runCorrelationTest({
		asOf: "2026-02-01",
		endMonth,
		strategyVersion: versionLabel(strategy),
		holdings: [
			{
				key: "asset-holding",
				value: known(10_000, "observed", syntheticSource),
				returns: holdingReturns,
			},
		],
		candidates: [{ key: "asset-c", returns: candidateCShortReturns }],
		contribution: missing("Aporte ainda não informado"),
		assumptions: { windows: [6], rollingWindow: 3, worstMonths: 2 },
	});
	assert.equal(inconclusiveR3Result.status, "inconclusive");
	assert.deepEqual(correlationTestSubjects(inconclusiveR3Result), []);
	const inconclusiveR3Ref = toAnalysisRef(
		"ana-r3-real-inc",
		inconclusiveR3Result,
		correlationTestSubjects(inconclusiveR3Result),
	);
	assert.deepEqual(inconclusiveR3Ref.subjects, []);
	assert.equal(
		evaluateProposal(
			makeProposal({
				items: [makeItem({ assetId: "asset-c", ticker: "HGLG11" })],
				analyses: [makeRef(), inconclusiveR3Ref],
			}),
			strategy,
		).approvable,
		false,
	);
});

test("R11: verifica afirmações apenas contra análises completas/parciais e sinaliza estratégia anterior e redução", () => {
	const v1 = buildStrategy("2026-01-01");
	const nextPrefs = buildPreferences();
	nextPrefs.monthlyCash.contribution = 3_000;
	const v2 = reviseStrategy(v1, nextPrefs, "2026-02-01").version;

	const proposal = makeProposal({
		kind: "rebalance",
		items: [
			makeItem({ part: "goal", assetClass: "fixedIncome", ticker: "TESOURO2030" }),
			makeItem({
				assetId: "asset-stock-1",
				ticker: "VALE3",
				part: "variableIncome",
				assetClass: "stock",
				direction: "reduce",
				quantity: 5,
				referencePrice: 62,
			}),
		],
		analyses: [
			makeRef({ id: "ana-v1", strategyVersion: "estrategia-principal@1" }),
			makeRef({
				id: "ana-partial",
				status: "partial",
				strategyVersion: "estrategia-principal@2",
			}),
			makeRef({
				id: "ana-inc",
				status: "inconclusive",
				strategyVersion: "estrategia-principal@2",
				subjects: [],
			}),
		],
		claims: [
			{ text: "Desvio da Meta calculado no R7.", analysisId: "ana-v1" },
			{ text: "Cobertura parcial calculada no R8.", analysisId: "ana-partial" },
			{ text: "Correlação favorável segundo análise inconclusiva.", analysisId: "ana-inc" },
			{ text: "Retorno esperado de 14% ao ano.", analysisId: null },
			{ text: "Correlação reduzida segundo simulação externa.", analysisId: "ana-inexistente" },
		],
	});

	const evaluation = evaluateProposal(proposal, v2);
	assert.equal(evaluation.approvable, true);
	assert.deepEqual(evaluation.claims, [
		{ text: "Desvio da Meta calculado no R7.", verification: "verified" },
		{ text: "Cobertura parcial calculada no R8.", verification: "verified" },
		{
			text: "Correlação favorável segundo análise inconclusiva.",
			verification: "unverified-opinion",
		},
		{ text: "Retorno esperado de 14% ao ano.", verification: "unverified-opinion" },
		{
			text: "Correlação reduzida segundo simulação externa.",
			verification: "unverified-opinion",
		},
	]);
	assert.deepEqual(evaluation.notVerified, [
		"Execução fora do produto: a próxima importação da B3 confere o que foi feito.",
		"Venda não simulada nesta versão do motor.",
	]);
	assert.equal(
		evaluation.findings.some(
			(finding) =>
				finding.code === "previous_strategy_version" &&
				finding.message === "Análise feita sob versão anterior da estratégia; revisão necessária.",
		),
		true,
	);
	assert.equal(
		evaluation.findings.filter((finding) => finding.code === "unverified_claim").length,
		3,
	);
});
