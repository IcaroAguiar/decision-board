export type { RateRiskInput, RateRiskOutput, ZeroCouponBond } from "./rate-risk.js";
export { analyzeRateRisk } from "./rate-risk.js";
export type { AccrualRate, RateScenario, RateStep } from "./rates.js";
export { createRatePath } from "./rates.js";
export type { FixedIncomeCandidate, FixedIncomeInput, SimulationRow } from "./simulation.js";
export { simulateFixedIncome } from "./simulation.js";
export type { SolverOptions } from "./solvers.js";
export { breakEvenCdi, turningPoint } from "./solvers.js";
export type {
	AccrualPoint,
	CustodyFee,
	RedemptionInput,
	RedemptionValue,
	TaxTable,
} from "./taxation.js";
export {
	defaultRegressiveIncomeTaxTable,
	defaultRegressiveIofTable,
	incomeTaxRate,
	iofRate,
	redemptionValue,
} from "./taxation.js";
