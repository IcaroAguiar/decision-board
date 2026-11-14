import assert from "node:assert/strict";
import test from "node:test";
import {
	type AnalysisRef,
	classifyAnalysesByStrategy,
	createStrategy,
	methodIds,
	reviseStrategy,
	versionLabel,
} from "../index.js";
import { buildPreferences, buildStrategy, makeRef } from "./fixtures.test.js";

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
