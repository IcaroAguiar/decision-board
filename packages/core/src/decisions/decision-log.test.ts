import assert from "node:assert/strict";
import test from "node:test";
import {
	authorizeMovementRecording,
	evaluateProposal,
	methodIds,
	recordDecision,
	reviseStrategy,
} from "../index.js";
import {
	buildPreferences,
	buildStrategy,
	makeItem,
	makeProposal,
	makeRef,
} from "./fixtures.test.js";

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
				subjects: ["asset-fii-1"],
			}),
		],
	});

	for (const unauthorizedActor of [
		{ kind: "scheduled-routine" } as const,
		{ kind: "ai-assistant" } as const,
		{ kind: "person", confirmedInSession: false } as const,
	]) {
		assert.throws(
			() =>
				recordDecision({
					proposal,
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
	for (const outcome of ["approved", "adjusted", "rejected", "postponed"] as const) {
		assert.throws(
			() =>
				recordDecision({
					proposal: noAnalysisProposal,
					outcome,
					reason: "Sem análise associada",
					decidedAt: "2026-02-10",
					strategy,
					actor: confirmedPerson,
				}),
			/ao menos uma análise/,
		);
	}

	const blockedProposal = makeProposal();
	assert.throws(
		() =>
			recordDecision({
				proposal: blockedProposal,
				outcome: "adjusted",
				reason: "Tentativa de ajuste em proposta bloqueada",
				decidedAt: "2026-02-10",
				strategy,
				actor: confirmedPerson,
			}),
		/bloqueada/,
	);

	const approved = recordDecision({
		proposal,
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

	const adjusted = recordDecision({
		proposal,
		outcome: "adjusted",
		reason: "Ajustado mantendo R3 e R7 válidos.",
		decidedAt: "2026-02-10",
		strategy,
		actor: confirmedPerson,
	});
	assert.equal(adjusted.outcome, "adjusted");
	assert.equal(adjusted.operationPlan?.status, "awaiting-execution");

	const rejected = recordDecision({
		proposal: blockedProposal,
		outcome: "rejected",
		reason: "Aguardar teste de correlação antes de decidir.",
		decidedAt: "2026-02-10",
		strategy,
		actor: confirmedPerson,
	});
	assert.equal(rejected.operationPlan, null);
	assert.equal(rejected.analyses.length, 1);

	const postponed = recordDecision({
		proposal: blockedProposal,
		outcome: "postponed",
		reason: "Adiado para o próximo aporte após obter série histórica.",
		decidedAt: "2026-02-10",
		strategy,
		actor: confirmedPerson,
	});
	assert.equal(postponed.outcome, "postponed");
	assert.equal(postponed.operationPlan, null);
	assert.equal(postponed.analyses.length, 1);
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
			makeRef({
				id: "ana-old",
				status: "inconclusive",
				strategyVersion: "estrategia-principal@1",
				subjects: [],
			}),
		],
		claims: [
			{ text: "Afirmação sem cálculo.", methodId: methodIds.goalTracking, analysisId: null },
			{
				text: "Afirmação apoiada em análise inconclusiva.",
				methodId: methodIds.allocationVsTarget,
				analysisId: "ana-old",
			},
		],
	});
	const evaluation = evaluateProposal(proposal, v2);

	const safeProposal = makeProposal({
		analyses: [
			makeRef(),
			makeRef({
				id: "ana-r3",
				method: { id: methodIds.correlationTest, version: "1.0.0" },
				status: "complete",
				subjects: ["asset-fii-1"],
			}),
		],
	});
	const approvedRecord = recordDecision({
		proposal: safeProposal,
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
