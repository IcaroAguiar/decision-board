import assert from "node:assert/strict";
import test from "node:test";
import { approxEqual } from "../units.js";
import { base, calendar, datum } from "./fixtures.test.js";
import { analyzeRateRisk } from "./index.js";
import { zeroCouponPrice } from "./rate-risk.js";

test("zero coupon full repricing and duration agree with formulas; one-year +1pp error < 1bp", () => {
	const maturity = calendar.addBusinessDays(base.from, 252);
	const analysis = analyzeRateRisk(
		{
			asOf: base.asOf,
			strategyVersion: "v1",
			bond: datum({ id: "zero", face: 1000, annualYield: 0.1, maturity }),
			goalDate: datum(maturity),
		},
		calendar,
	);
	assert.equal(analysis.status, "complete");
	assert.ok(analysis.output);
	const out = analysis.output;
	const pu = 1000 / 1.1;
	const shocked = 1000 / 1.11;
	const variation = 1.1 / 1.11 - 1;
	assert.ok(approxEqual(out.price, pu, { relative: 1e-12 }));
	assert.ok(approxEqual(out.repricedPrice, shocked, { relative: 1e-12 }));
	assert.ok(approxEqual(out.repricingRelativeChange, variation, { relative: 1e-12 }));
	assert.ok(approxEqual(out.repricingPriceChange, shocked - pu, { relative: 1e-12 }));
	assert.ok(approxEqual(out.modifiedDuration, 1 / 1.1));
	assert.ok(approxEqual(out.durationRelativeChange, -0.01 / 1.1));
	assert.equal(out.approximationError, out.durationRelativeChange - out.repricingRelativeChange);
	assert.ok(analysis.notVerified.includes("Duração calculada apenas para títulos sem cupom."));
	// Convexity makes duration first-order: <0.0001 of price for this 252-DU fixture.
	assert.ok(Math.abs(out.durationRelativeChange - variation) < 0.0001);
	assert.equal(zeroCouponPrice(1000, 0.1, 0), 1000);
});
test("R2 alerts on goal and strategy term and respects explicit shock", () => {
	const result = analyzeRateRisk(
		{
			asOf: base.asOf,
			strategyVersion: "v1",
			bond: datum({ id: "zero", face: 1000, annualYield: 0.1, maturity: base.to }),
			goalDate: datum("2026-12-01"),
			strategyMaxBusinessDays: 100,
			shock: -0.01,
		},
		calendar,
	);
	assert.deepEqual(
		result.findings.map((f) => f.code),
		["MATURITY_AFTER_GOAL", "MATURITY_AFTER_STRATEGY_LIMIT"],
	);
	assert.ok(result.output && result.output.repricingRelativeChange > 0);
	assert.equal(result.assumptions.shock, -0.01);
	for (const finding of result.findings)
		assert.doesNotMatch(finding.message, /compr|vend|recomend/i);
	assert.deepEqual(result.notVerified, [
		"Duração calculada apenas para títulos sem cupom.",
		"preço efetivo de recompra pelo Tesouro",
		"liquidez de papéis privados no secundário",
	]);
});
test("R2 reports matured bonds and past goals as data conditions", () => {
	const input = {
		asOf: base.asOf,
		strategyVersion: null,
		bond: datum({ id: "zero", face: 1000, annualYield: 0.1, maturity: "2026-03-01" }),
		goalDate: datum(base.to),
	};
	const matured = analyzeRateRisk(input, calendar);
	assert.equal(matured.status, "inconclusive");
	assert.equal(matured.output, null);
	assert.ok(matured.findings.some((f) => f.subject === "zero" && f.severity === "warning"));
	assert.ok(matured.notVerified.includes("Título vencido antes da data da análise."));
	assert.equal(input.bond.status, "known");
	if (input.bond.status !== "known") throw new Error("Fixture ausente");
	const pastGoal = analyzeRateRisk(
		{
			...input,
			bond: datum({ ...input.bond.value, maturity: base.to }),
			goalDate: datum("2026-03-01"),
		},
		calendar,
	);
	assert.equal(pastGoal.status, "partial");
	assert.ok(pastGoal.output);
	assert.ok(pastGoal.findings.some((f) => f.code === "PAST_GOAL"));
	assert.equal(
		pastGoal.findings.some((f) => f.code === "MATURITY_AFTER_GOAL"),
		false,
	);
	assert.ok(pastGoal.notVerified.includes("Objetivo anterior à data da análise."));
});
