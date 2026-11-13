import { createBusinessCalendar } from "../calendar.js";
import { type Datum, known, missing } from "../provenance.js";
import {
	defaultRegressiveIncomeTaxTable,
	type FixedIncomeCandidate,
	type FixedIncomeInput,
	type RateScenario,
	type RedemptionInput,
} from "./index.js";

export { missing };

export const calendar = createBusinessCalendar({
	holidays: ["2026-03-04"],
	coveredFrom: "2026-01-01",
	coveredUntil: "2030-12-31",
});
export const source = {
	id: "synthetic",
	label: "Dados sintéticos",
	asOf: "2026-03-02",
	official: true,
};
export function datum<T>(value: T): Datum<T> {
	return known(value, "informed", source);
}
export const scenario: RateScenario = {
	id: "constant",
	kind: "manual",
	steps: [{ effectiveFrom: "2026-01-01", annualRate: 0.12 }],
};
export const noCustody = { validFrom: "2026-01-01", annualRate: 0, exemptBalance: 0 };
export const base: RedemptionInput = {
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
export const candidate: FixedIncomeCandidate = {
	id: "fixed",
	maturity: "2027-03-02",
	rate: base.rate,
	taxExempt: false,
	custody: datum(noCustody),
};
export function simulationInput(): FixedIncomeInput {
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
