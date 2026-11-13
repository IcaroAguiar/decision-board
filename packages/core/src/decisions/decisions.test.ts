import assert from "node:assert/strict";
import test from "node:test";
import {
	type AnalysisRef,
	authorizeMovementRecording,
	classifyAnalysesByStrategy,
	createStrategy,
	evaluateProposal,
	methodIds,
	type OperationPlanItem,
	type Proposal,
	recordDecision,
	reviseStrategy,
	type StrategyPreferences,
	type StrategyVersion,
	versionLabel,
} from "../index.js";

function buildPreferences(): StrategyPreferences {
	return {
		parts: {
			reserve: {
				role: "Liquidez e proteção",
				target: 0.2,
				band: { min: 0.15, max: 0.25 },
				horizonMonths: 12,
			},
			goal: {
				role: "Objetivo de médio prazo",
				target: 0.5,
				band: { min: 0.45, max: 0.55 },
				horizonMonths: 36,
			},
			variableIncome: {
				role: "Crescimento e renda",
				target: 0.3,
				band: { min: 0.25, max: 0.35 },
				horizonMonths: null,
			},
		},
		maxFixedIncomeTermMonths: 60,
		prefersMonthlyReinvestableIncome: true,
		allowedInstitutionsByAssetClass: {
			fixedIncome: ["Corretora Alfa", "Banco Beta"],
			fii: ["Corretora Alfa"],
		},
		reserve: {
			ceiling: 30_000,
			annualRate: 0.105,
			validFrom: "2026-01-01",
		},
		monthlyCash: {
			contribution: 2_500,
			receiptDay: 5,
			slack: 300,
			goalShare: 0.6,
			reminderEnabled: true,
		},
	};
}

function buildStrategy(effectiveFrom = "2026-01-01"): StrategyVersion {
	return createStrategy("estrategia-principal", buildPreferences(), effectiveFrom);
}

function makeRef(overrides: Partial<AnalysisRef> = {}): AnalysisRef {
	return {
		id: "ana-r7-1",
		method: { id: methodIds.allocationVsTarget, version: "1.0.0" },
		asOf: "2026-02-01",
		status: "complete",
		strategyVersion: "estrategia-principal@1",
		...overrides,
	};
}

function makeItem(overrides: Partial<OperationPlanItem> = {}): OperationPlanItem {
	return {
		assetId: "asset-fii-1",
		ticker: "XPLG11",
		part: "variableIncome",
		assetClass: "fii",
		direction: "allocate",
		quantity: 10,
		referencePrice: 100,
		...overrides,
	};
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
	return {
		id: "prop-2026-02",
		kind: "contribution",
		items: [makeItem()],
		analyses: [makeRef()],
		justifications: [],
		claims: [],
		...overrides,
	};
}

test("R12: cria estratégia v1, versiona apenas alterações reais e classifica análises", () => {
	const v1 = buildStrategy("2026-01-01");
	assert.equal(v1.version, 1);
	assert.equal(versionLabel(v1), "estrategia-principal@1");

	const unchanged = reviseStrategy(v1, buildPreferences(), "2026-02-01");
	assert.equal(unchanged.changed, false);
	assert.equal(unchanged.version.version, 1);
	assert.deepEqual(unchanged.changedFields, []);

	const updatedPreferences = buildPreferences();
	updatedPreferences.parts.variableIncome.target = 0.35;
	updatedPreferences.parts.variableIncome.band = { min: 0.3, max: 0.4 };
	updatedPreferences.parts.goal.target = 0.45;
	updatedPreferences.parts.goal.band = { min: 0.4, max: 0.5 };
	updatedPreferences.monthlyCash.contribution = 3_000;
	updatedPreferences.allowedInstitutionsByAssetClass = {
		fixedIncome: ["Corretora Alfa", "Banco Beta"],
		fii: ["Corretora Alfa", "Corretora Gama"],
		stock: ["Corretora Gama"],
	};

	const revised = reviseStrategy(v1, updatedPreferences, "2026-02-15");
	assert.equal(revised.changed, true);
	assert.equal(revised.version.version, 2);
	assert.equal(revised.version.effectiveFrom, "2026-02-15");
	assert.equal(versionLabel(revised.version), "estrategia-principal@2");
	assert.deepEqual(revised.changedFields, [
		"allowedInstitutionsByAssetClass.fii",
		"allowedInstitutionsByAssetClass.stock",
		"monthlyCash.contribution",
		"parts.goal.band.max",
		"parts.goal.band.min",
		"parts.goal.target",
		"parts.variableIncome.band.max",
		"parts.variableIncome.band.min",
		"parts.variableIncome.target",
	]);

	const refs: AnalysisRef[] = [
		makeRef({ id: "ref-v1", strategyVersion: "estrategia-principal@1" }),
		makeRef({ id: "ref-v2", strategyVersion: "estrategia-principal@2" }),
		makeRef({
			id: "ref-null",
			method: { id: methodIds.fixedIncomeSimulation, version: "1.0.0" },
			strategyVersion: null,
		}),
	];
	assert.deepEqual(
		classifyAnalysesByStrategy(refs, revised.version).map((entry) => ({
			id: entry.ref.id,
			classification: entry.classification,
		})),
		[
			{ id: "ref-v1", classification: "previous" },
			{ id: "ref-v2", classification: "current" },
			{ id: "ref-null", classification: "notTied" },
		],
	);
});

test("R12: valida invariantes de alvos, faixas, dia de recebimento, valores e vigência", () => {
	const badSum = buildPreferences();
	badSum.parts.reserve.target = 0.25;
	assert.throws(() => createStrategy("s1", badSum, "2026-01-01"), /somar 1/);

	const badBand = buildPreferences();
	badBand.parts.goal.band = { min: 0.52, max: 0.55 };
	assert.throws(() => createStrategy("s1", badBand, "2026-01-01"), /faixa/);

	const badDay = buildPreferences();
	badDay.monthlyCash.receiptDay = 29;
	assert.throws(() => createStrategy("s1", badDay, "2026-01-01"), /1 e 28/);

	const badGoalShare = buildPreferences();
	badGoalShare.monthlyCash.goalShare = 1.2;
	assert.throws(() => createStrategy("s1", badGoalShare, "2026-01-01"), /0 e 1/);

	const negativeContribution = buildPreferences();
	negativeContribution.monthlyCash.contribution = -1;
	assert.throws(() => createStrategy("s1", negativeContribution, "2026-01-01"), /não negativo/);

	const current = buildStrategy("2026-02-01");
	const next = buildPreferences();
	next.monthlyCash.slack = 400;
	assert.throws(() => reviseStrategy(current, next, "2026-01-31"), /anterior/);
});

test("R11: proposta de renda variável exige R3 completo/parcial ou justificativa com motivo", () => {
	const strategy = buildStrategy();
	const person = { kind: "person", confirmedInSession: true } as const;

	const withoutR3 = makeProposal();
	const blockedEval = evaluateProposal(withoutR3, strategy);
	assert.equal(blockedEval.approvable, false);
	assert.deepEqual(blockedEval.findings, [
		{
			code: "missing_r3_correlation_test",
			severity: "blocked",
			message: "Revisão necessária: proposta de renda variável sem teste de correlação (R3).",
		},
	]);
	assert.throws(
		() =>
			recordDecision({
				proposal: withoutR3,
				evaluation: blockedEval,
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
			}),
		],
	});
	assert.equal(evaluateProposal(withPartialR3, strategy).approvable, true);

	const withBlankWaiver = makeProposal({
		justifications: [{ code: "r3-waived", reason: "   " }],
	});
	assert.equal(evaluateProposal(withBlankWaiver, strategy).approvable, false);

	const withValidWaiver = makeProposal({
		justifications: [
			{ code: "r3-waived", reason: "Série histórica indisponível; posição pequena." },
		],
	});
	const waivedEval = evaluateProposal(withValidWaiver, strategy);
	assert.equal(waivedEval.approvable, true);
});

test("R11: verifica afirmações contra análises e sinaliza estratégia anterior e redução", () => {
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
		analyses: [makeRef({ id: "ana-v1", strategyVersion: "estrategia-principal@1" })],
		claims: [
			{ text: "Desvio da Meta calculado no R7.", analysisId: "ana-v1" },
			{ text: "Retorno esperado de 14% ao ano.", analysisId: null },
			{ text: "Correlação reduzida segundo simulação externa.", analysisId: "ana-inexistente" },
		],
	});

	const evaluation = evaluateProposal(proposal, v2);
	assert.equal(evaluation.approvable, true);
	assert.deepEqual(evaluation.claims, [
		{ text: "Desvio da Meta calculado no R7.", verification: "verified" },
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
		2,
	);
});

test("R11: valida itens da proposta e regras de registro, plano e autorização por ator", () => {
	const strategy = buildStrategy();

	assert.throws(
		() => evaluateProposal(makeProposal({ items: [makeItem({ quantity: 1.5 })] }), strategy),
		/inteiro positivo/,
	);
	assert.throws(
		() => evaluateProposal(makeProposal({ items: [makeItem({ referencePrice: 0 })] }), strategy),
		/positivo/,
	);
	assert.throws(
		() =>
			evaluateProposal(
				makeProposal({ items: [makeItem(), makeItem({ ticker: "XPLG11" })] }),
				strategy,
			),
		/duplicado/,
	);

	assert.equal(authorizeMovementRecording({ kind: "scheduled-routine" }).allowed, false);
	assert.equal(authorizeMovementRecording({ kind: "ai-assistant" }).allowed, false);
	assert.equal(
		authorizeMovementRecording({ kind: "person", confirmedInSession: false }).allowed,
		false,
	);
	assert.deepEqual(authorizeMovementRecording({ kind: "person", confirmedInSession: true }), {
		allowed: true,
	});

	const proposal = makeProposal({
		analyses: [
			makeRef({ id: "ana-r7", method: { id: methodIds.allocationVsTarget, version: "1.0.0" } }),
			makeRef({
				id: "ana-r3",
				method: { id: methodIds.correlationTest, version: "2.1.0" },
				status: "complete",
			}),
		],
	});
	const evaluation = evaluateProposal(proposal, strategy);

	for (const unauthorizedActor of [
		{ kind: "scheduled-routine" } as const,
		{ kind: "ai-assistant" } as const,
		{ kind: "person", confirmedInSession: false } as const,
	]) {
		assert.throws(
			() =>
				recordDecision({
					proposal,
					evaluation,
					outcome: "approved",
					reason: "Aprovado após revisão",
					decidedAt: "2026-02-10",
					strategy,
					actor: unauthorizedActor,
				}),
			/confirmação explícita/,
		);
	}

	const confirmedPerson = { kind: "person", confirmedInSession: true } as const;
	assert.throws(
		() =>
			recordDecision({
				proposal,
				evaluation,
				outcome: "approved",
				reason: "   ",
				decidedAt: "2026-02-10",
				strategy,
				actor: confirmedPerson,
			}),
		/motivo/,
	);

	const noAnalysisProposal = makeProposal({
		items: [makeItem({ part: "reserve", assetClass: "cdb", ticker: "CDB-LIQ" })],
		analyses: [],
	});
	const noAnalysisEval = evaluateProposal(noAnalysisProposal, strategy);
	assert.throws(
		() =>
			recordDecision({
				proposal: noAnalysisProposal,
				evaluation: noAnalysisEval,
				outcome: "adjusted",
				reason: "Sem análise associada",
				decidedAt: "2026-02-10",
				strategy,
				actor: confirmedPerson,
			}),
		/ao menos uma análise/,
	);

	const approved = recordDecision({
		proposal,
		evaluation,
		outcome: "approved",
		reason: "Alinhado aos alvos da estratégia e com R3 verificado.",
		decidedAt: "2026-02-10",
		strategy,
		actor: confirmedPerson,
	});
	assert.equal(approved.proposalId, "prop-2026-02");
	assert.equal(approved.outcome, "approved");
	assert.equal(approved.strategyVersion, "estrategia-principal@1");
	assert.deepEqual(approved.analyses, [
		{
			id: "ana-r7",
			methodId: methodIds.allocationVsTarget,
			methodVersion: "1.0.0",
			status: "complete",
		},
		{
			id: "ana-r3",
			methodId: methodIds.correlationTest,
			methodVersion: "2.1.0",
			status: "complete",
		},
	]);
	assert.deepEqual(approved.operationPlan, {
		proposalId: "prop-2026-02",
		items: proposal.items,
		status: "awaiting-execution",
		note: "Executado pela pessoa fora do Decision Board; conferido na próxima importação da B3.",
	});

	const rejected = recordDecision({
		proposal: makeProposal(),
		evaluation: evaluateProposal(makeProposal(), strategy),
		outcome: "rejected",
		reason: "Aguardar teste de correlação antes de decidir.",
		decidedAt: "2026-02-10",
		strategy,
		actor: confirmedPerson,
	});
	assert.equal(rejected.operationPlan, null);
});

test("guarda de linguagem: nenhuma mensagem usa termos prescritivos ou 'venda' fora da nota fixa", () => {
	const v1 = buildStrategy("2026-01-01");
	const nextPrefs = buildPreferences();
	nextPrefs.monthlyCash.contribution = 3_000;
	const v2 = reviseStrategy(v1, nextPrefs, "2026-02-01").version;

	const proposal = makeProposal({
		items: [
			makeItem(),
			makeItem({
				assetId: "asset-2",
				ticker: "ITUB4",
				part: "variableIncome",
				assetClass: "stock",
				direction: "reduce",
				quantity: 10,
				referencePrice: 35,
			}),
		],
		analyses: [
			makeRef({ id: "ana-old", status: "inconclusive", strategyVersion: "estrategia-principal@1" }),
		],
		claims: [{ text: "Afirmação sem cálculo.", analysisId: null }],
	});
	const evaluation = evaluateProposal(proposal, v2);

	const safeProposal = makeProposal({
		analyses: [
			makeRef(),
			makeRef({
				id: "ana-r3",
				method: { id: methodIds.correlationTest, version: "1.0.0" },
				status: "complete",
			}),
		],
	});
	const approvedRecord = recordDecision({
		proposal: safeProposal,
		evaluation: evaluateProposal(safeProposal, v2),
		outcome: "approved",
		reason: "Aprovado conforme análise R3 e R7.",
		decidedAt: "2026-02-10",
		strategy: v2,
		actor: { kind: "person", confirmedInSession: true },
	});

	const routineAuth = authorizeMovementRecording({ kind: "scheduled-routine" });
	const assistantAuth = authorizeMovementRecording({ kind: "ai-assistant" });
	const personAuth = authorizeMovementRecording({ kind: "person", confirmedInSession: false });

	const texts = [
		...evaluation.findings.map((finding) => finding.message),
		...evaluation.notVerified,
		approvedRecord.operationPlan?.note ?? "",
		routineAuth.allowed ? "" : routineAuth.reason,
		assistantAuth.allowed ? "" : assistantAuth.reason,
		personAuth.allowed ? "" : personAuth.reason,
	].filter((text) => text.length > 0);

	const fixedSaleNote = "Venda não simulada nesta versão do motor.";
	for (const text of texts) {
		assert.equal(/compr|recomend/i.test(text), false, `Texto proibido: ${text}`);
		if (/venda/i.test(text)) {
			assert.equal(text, fixedSaleNote);
		}
	}
});
