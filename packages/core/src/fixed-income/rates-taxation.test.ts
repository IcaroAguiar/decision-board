import assert from "node:assert/strict";
import test from "node:test";
import { createBusinessCalendar } from "../calendar.js";
import { approxEqual } from "../units.js";
import { base, calendar, datum, noCustody, scenario, simulationInput } from "./fixtures.test.js";
import {
	analyzeRateRisk,
	breakEvenCdi,
	createRatePath,
	incomeTaxRate,
	type RateScenario,
	redemptionValue,
	simulateFixedIncome,
	turningPoint,
} from "./index.js";
import { zeroCouponPrice } from "./rate-risk.js";
import { grow } from "./rates.js";

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
		if (expected === undefined) throw new Error("Caso sintético inválido");
		const end = new Date(Date.parse(base.from) + days * 86_400_000).toISOString().slice(0, 10);
		let businessDays = 0;
		for (let day = 0; day < days; day += 1) {
			const date = new Date(Date.parse(base.from) + day * 86_400_000);
			if (
				date.getUTCDay() !== 0 &&
				date.getUTCDay() !== 6 &&
				date.toISOString().slice(0, 10) !== "2026-03-04"
			)
				businessDays++;
		}
		const result = redemptionValue({ ...base, to: end });
		const gain = 1000 * (1.1 ** (businessDays / 252) - 1);
		assert.ok(approxEqual(result.incomeTax, gain * expected, { absolute: 1e-8 }));
		assert.equal(result.calendarDays, days);
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
test("calendar preparation stays bounded independently of solver iterations", () => {
	function run(tolerance: number, turning: boolean) {
		let calls = 0;
		const counted = {
			...calendar,
			businessDaysBetween(...args: Parameters<typeof calendar.businessDaysBetween>) {
				calls++;
				return calendar.businessDaysBetween(...args);
			},
			isBusinessDay(date: string) {
				calls++;
				return calendar.isBusinessDay(date);
			},
			adjustToBusinessDay(...args: Parameters<typeof calendar.adjustToBusinessDay>) {
				calls++;
				return calendar.adjustToBusinessDay(...args);
			},
			addBusinessDays(...args: Parameters<typeof calendar.addBusinessDays>) {
				calls++;
				return calendar.addBusinessDays(...args);
			},
		};
		if (turning)
			turningPoint({
				prefixed: { ...base, calendar: counted },
				postfixed: { ...base, calendar: counted },
				solver: { tolerance },
			});
		else
			breakEvenCdi({
				targetNet: 1000 + (1000 * 1.1 ** (260 / 252) - 1000) * 0.825,
				product: "cdb",
				investment: { ...base, calendar: counted },
				solver: { tolerance },
			});
		return calls;
	}
	for (const turning of [false, true]) {
		const coarse = run(0.01, turning);
		assert.ok(coarse > 0 && coarse <= 522);
		assert.equal(run(1e-12, turning), coarse);
	}
});
