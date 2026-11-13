import assert from "node:assert/strict";
import test from "node:test";
import { createBusinessCalendar } from "../calendar.js";
import { type Datum, known, missing } from "../provenance.js";
import { approxEqual } from "../units.js";
import {
	analyzeRateRisk,
	breakEvenCdi,
	createRatePath,
	defaultRegressiveIncomeTaxTable,
	type FixedIncomeCandidate,
	type FixedIncomeInput,
	grow,
	incomeTaxRate,
	type RateScenario,
	type RedemptionInput,
	redemptionValue,
	simulateFixedIncome,
	turningPoint,
	zeroCouponPrice,
} from "./index.js";

const calendar = createBusinessCalendar({
	holidays: ["2026-03-04"],
	coveredFrom: "2026-01-01",
	coveredUntil: "2030-12-31",
});
const source = { id: "synthetic", label: "Dados sintéticos", asOf: "2026-03-02", official: true };
function datum<T>(value: T): Datum<T> {
	return known(value, "informed", source);
}
const scenario: RateScenario = {
	id: "constant",
	kind: "manual",
	steps: [{ effectiveFrom: "2026-01-01", annualRate: 0.12 }],
};
const noCustody = { validFrom: "2026-01-01", annualRate: 0, exemptBalance: 0 };
const base: RedemptionInput = {
	principal: 1000,
	from: "2026-03-02",
	to: "2027-03-02",
	asOf: "2026-03-02",
	calendar,
	scenario,
	rate: { kind: "prefixed", annualRate: 0.1 },
	taxTable: defaultRegressiveIncomeTaxTable,
	taxExempt: false,
	custody: noCustody,
};
const candidate: FixedIncomeCandidate = {
	id: "fixed",
	maturity: "2027-03-02",
	rate: base.rate,
	taxExempt: false,
	custody: datum(noCustody),
};
function simulationInput(): FixedIncomeInput {
	return {
		asOf: base.asOf,
		strategyVersion: "synthetic-v1",
		from: base.from,
		redemptionDate: base.to,
		principal: datum(1000),
		candidates: [datum(candidate)],
		scenarios: [datum(scenario)],
		taxTable: datum(base.taxTable),
	};
}

test("synthetic holiday and weekend count follows [start,end), no compounding on either", () => {
	assert.equal(calendar.businessDaysBetween("2026-03-02", "2026-03-09"), 4);
	const actual = redemptionValue({ ...base, to: "2026-03-09" });
	assert.equal(actual.businessDays, 4);
	assert.equal(actual.calendarDays, 7);
	assert.deepEqual(
		actual.evolution.map((point) => point.businessDate),
		["2026-03-02", "2026-03-03", "2026-03-05", "2026-03-06"],
	);
	for (const [index, point] of actual.evolution.entries()) {
		assert.ok(approxEqual(point.gross, 1000 * 1.1 ** ((index + 1) / 252)));
		assert.equal(point.custodyAccrued, 0);
	}
	assert.ok(approxEqual(actual.gross, 1000 * 1.1 ** (4 / 252)));
});

test("meeting step applies on its effective business day, with hand computed three-day factors", () => {
	const path: RateScenario = {
		id: "meeting",
		kind: "alternative",
		steps: [
			{ effectiveFrom: "2026-03-02", annualRate: 0.08 },
			{ effectiveFrom: "2026-03-05", annualRate: 0.16 },
		],
	};
	// Mon 02, Tue 03, Thu 05 (Wed 04 is an injected holiday).
	const expected = 1000 * 1.08 ** (2 / 252) * 1.16 ** (1 / 252);
	const input = { ...base, to: "2026-03-06", scenario: path };
	assert.ok(approxEqual(grow({ ...input, rate: { kind: "selic-like" } }), expected));
	assert.ok(approxEqual(createRatePath(path.steps).dailyFactor("2026-03-05"), 1.16 ** (1 / 252)));
	assert.ok(
		approxEqual(
			grow({ ...input, rate: { kind: "cdi-percentage", multiplier: 1.05 } }),
			1000 * (1 + 1.05 * (1.08 ** (1 / 252) - 1)) ** 2 * (1 + 1.05 * (1.16 ** (1 / 252) - 1)),
		),
	);
	assert.ok(
		approxEqual(
			grow({ ...input, rate: { kind: "cdi-spread", annualSpread: 0.02 } }),
			expected * 1.02 ** (3 / 252),
		),
	);
	assert.ok(
		approxEqual(
			grow({ ...input, rate: { kind: "prefixed", annualRate: 0.1 } }),
			1000 * 1.1 ** (3 / 252),
		),
	);
});

test("IR boundaries change exactly at 181, 361 and 721 calendar days", () => {
	for (const [days, expected] of [
		[180, 0.225],
		[181, 0.2],
		[360, 0.2],
		[361, 0.175],
		[720, 0.175],
		[721, 0.15],
	]) {
		assert.notEqual(days, undefined);
		assert.notEqual(expected, undefined);
		if (days === undefined) throw new Error("Caso sintético inválido");
		assert.equal(incomeTaxRate(base.taxTable, days, base.asOf), expected);
	}
	assert.equal(
		redemptionValue({ ...base, rate: { kind: "prefixed", annualRate: -0.1 } }).incomeTax,
		0,
	);
	assert.equal(redemptionValue({ ...base, taxExempt: true }).incomeTax, 0);
});

test("custody applies to daily opening excess only, below and at threshold exempt", () => {
	const custody = { ...noCustody, annualRate: 0.02, exemptBalance: 1000 };
	for (const principal of [900, 1000])
		assert.equal(redemptionValue({ ...base, principal, to: "2026-03-03", custody }).custody, 0);
	const oneDay = redemptionValue({ ...base, principal: 1200, to: "2026-03-03", custody });
	assert.equal(oneDay.custody, (200 * 0.02) / 252);
	assert.ok(
		approxEqual(
			oneDay.net,
			1200 * 1.1 ** (1 / 252) - (1200 * 1.1 ** (1 / 252) - 1200) * 0.225 - (200 * 0.02) / 252,
		),
	);
	const twoDays = redemptionValue({ ...base, principal: 1200, to: "2026-03-04", custody });
	assert.ok(approxEqual(twoDays.custody, ((200 + 1200 * 1.1 ** (1 / 252) - 1000) * 0.02) / 252));
});

test("CDB versus prefixed break-even matches independently derived constant-CDI closed form", () => {
	// 260 synthetic DU, 365 calendar days -> IR=17.5% for both products.
	assert.equal(calendar.businessDaysBetween(base.from, base.to), 260);
	const grossTarget = 1000 * 1.1 ** (260 / 252);
	const targetNet = 1000 + (grossTarget - 1000) * (1 - 0.175);
	const expected = (1.1 ** (1 / 252) - 1) / (1.12 ** (1 / 252) - 1);
	const actual = breakEvenCdi({ targetNet, product: "cdb", investment: base });
	assert.ok(Math.abs(actual - expected) < 0.0001);
	assert.ok(Math.abs(actual - expected) < 1e-9);
	assert.ok(
		Math.abs(
			redemptionValue({ ...base, rate: { kind: "cdi-percentage", multiplier: actual } }).net -
				targetNet,
		) < 1e-6,
	);
});

test("exempt LCI versus taxed CDB matches independent closed form", () => {
	const cdiDaily = 1.12 ** (1 / 252) - 1;
	const taxedGross = 1000 * (1 + 1.05 * cdiDaily) ** 260;
	const targetNet = 1000 + (taxedGross - 1000) * 0.825;
	const expected = ((targetNet / 1000) ** (1 / 260) - 1) / cdiDaily;
	const actual = breakEvenCdi({ targetNet, product: "lci", investment: base });
	assert.ok(Math.abs(actual - expected) < 0.0001);
	assert.ok(Math.abs(actual - expected) < 1e-9);
});

test("turning point equates net values despite different tax and custody", () => {
	const postfixed = {
		...base,
		taxExempt: true,
		custody: { ...noCustody, annualRate: 0.002, exemptBalance: 500 },
	};
	const point = turningPoint({ prefixed: base, postfixed });
	const variable = redemptionValue({
		...postfixed,
		rate: { kind: "selic-like" },
		scenario: { ...scenario, steps: [{ effectiveFrom: base.from, annualRate: point }] },
	});
	assert.ok(Math.abs(variable.net - redemptionValue(base).net) < 1e-6);
	assert.ok(
		redemptionValue({
			...postfixed,
			rate: { kind: "selic-like" },
			scenario: { ...scenario, steps: [{ effectiveFrom: base.from, annualRate: point + 0.01 }] },
		}).net > redemptionValue(base).net,
	);
});

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
		"preço efetivo de recompra pelo Tesouro",
		"liquidez de papéis privados no secundário",
	]);
});

test("public R1 envelope keeps evidence, assumptions and comparisons for each scenario", () => {
	const input = simulationInput();
	const result = simulateFixedIncome(
		{
			...input,
			scenarios: [datum(scenario), datum({ ...scenario, id: "alt", kind: "alternative" })],
			comparisons: [{ candidateId: "fixed", product: "cdb", custody: datum(noCustody) }],
			turningPoints: [{ candidateId: "fixed", custody: datum(noCustody), taxExempt: false }],
		},
		calendar,
	);
	assert.equal(result.method.id, "r1.fixed-income-simulation");
	assert.equal(result.strategyVersion, "synthetic-v1");
	assert.equal(result.status, "complete");
	assert.ok(result.output);
	assert.equal(result.output.length, 2);
	for (const row of result.output) {
		assert.equal(row.value.nature, "estimated");
		assert.ok(approxEqual(row.value.gross, 1000 * 1.1 ** (260 / 252)));
		assert.equal(row.breakEvens.length, 1);
		assert.ok(row.turningPoint !== null && Math.abs(row.turningPoint - 0.1) < 1e-9);
	}
	assert.deepEqual(result.sources, [source]);
	assert.deepEqual(result.notVerified, [
		"taxa de custódia própria da instituição, quando não informada",
		"mudança de regra tributária depois da data da análise",
		"preço de venda antecipada fica a cargo do R2",
	]);
	for (const finding of result.findings)
		assert.doesNotMatch(finding.message, /compr|vend|recomend/i);
});

test("missing data stays missing, missing custody never becomes zero", () => {
	const input = simulationInput();
	const partial = simulateFixedIncome(
		{
			...input,
			candidates: [
				...input.candidates,
				datum({ ...candidate, id: "unknown-fee", custody: missing("Custódia ausente") }),
			],
		},
		calendar,
	);
	assert.equal(partial.status, "partial");
	assert.ok(partial.output);
	assert.equal(partial.output.length, 1);
	assert.ok(partial.notVerified.includes("Custódia ausente"));
	const empty = simulateFixedIncome(
		{ ...input, principal: missing("Principal ausente") },
		calendar,
	);
	assert.equal(empty.status, "inconclusive");
	assert.equal(empty.output, null);
	const bond = datum({ id: "zero", face: 1000, annualYield: 0.1, maturity: base.to });
	assert.equal(
		analyzeRateRisk(
			{ asOf: base.asOf, strategyVersion: null, bond, goalDate: missing("Objetivo ausente") },
			calendar,
		).status,
		"partial",
	);
	assert.equal(
		analyzeRateRisk(
			{
				asOf: base.asOf,
				strategyVersion: null,
				bond: missing("Título ausente"),
				goalDate: datum(base.to),
			},
			calendar,
		).output,
		null,
	);
});

test("coverage errors are explicit, including a nonbusiness redemption endpoint", () => {
	const bounded = createBusinessCalendar({
		holidays: [],
		coveredFrom: base.from,
		coveredUntil: "2026-03-06",
	});
	assert.throws(
		() => grow({ ...base, calendar: bounded, to: "2026-03-07" }),
		/calendário de feriados não cobre/,
	);
	assert.throws(
		() => simulateFixedIncome({ ...simulationInput(), redemptionDate: "2026-03-07" }, bounded),
		/calendário de feriados não cobre/,
	);
	assert.throws(
		() =>
			analyzeRateRisk(
				{
					asOf: base.asOf,
					strategyVersion: null,
					bond: datum({ id: "zero", face: 1000, annualYield: 0.1, maturity: base.to }),
					goalDate: datum(base.to),
				},
				bounded,
			),
		/calendário de feriados não cobre/,
	);
	assert.ok(redemptionValue({ ...base, calendar: bounded, to: "2026-03-06" }).net > 1000);
});

test("reject invalid paths, expired assumptions, impossible rates and unbracketed roots", () => {
	assert.throws(() => createRatePath([]), /Informe o caminho/);
	assert.throws(
		() => createRatePath([{ effectiveFrom: base.from, annualRate: -1 }]),
		/maior que -1/,
	);
	assert.throws(
		() =>
			createRatePath([
				scenario.steps[0] ?? { effectiveFrom: base.from, annualRate: 0 },
				{ effectiveFrom: "2025-01-01", annualRate: 0.1 },
			]),
		/ordem/,
	);
	assert.throws(() => createRatePath(scenario.steps).dailyFactor("2025-12-01"), /não cobre/);
	assert.throws(
		() => redemptionValue({ ...base, custody: { ...noCustody, validUntil: "2026-02-01" } }),
		/vigência/,
	);
	assert.throws(
		() =>
			redemptionValue({
				...base,
				taxTable: { validFrom: base.from, brackets: [{ throughCalendarDays: 180, rate: 0.2 }] },
			}),
		/todos os prazos/,
	);
	assert.throws(() => grow({ ...base, principal: Number.NaN }), /finito/);
	assert.throws(
		() => breakEvenCdi({ targetNet: 1e9, product: "cdb", investment: base }),
		/não está contido/,
	);
	assert.throws(
		() =>
			breakEvenCdi({
				targetNet: 1100,
				product: "lci",
				investment: {
					...base,
					scenario: { ...scenario, steps: [{ effectiveFrom: base.from, annualRate: 0 }] },
				},
			}),
		/único/,
	);
	assert.throws(() => zeroCouponPrice(1000, -1, 252), /maior que -1/);
});
