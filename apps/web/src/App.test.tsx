import assert from "node:assert/strict";
import { App } from "./App.js";
import {
	type ContributionCycle,
	canConfirmContributionCycle,
	canGenerateContributionReport,
	cycleStatuses,
	formatCurrency,
	getCurrentCycleMonth,
	getNextReviewDate,
	isConfirmableCycle,
	markCycleReported,
	normalizeApiBase,
	normalizeConfirmedAmount,
	strategyIds,
} from "./monthly-contribution.js";

assert.equal(typeof App, "function");
assert.equal(getCurrentCycleMonth(new Date("2026-05-23T12:00:00.000Z")), "2026-05");
assert.equal(getCurrentCycleMonth(new Date(2026, 4, 31, 21, 30)), "2026-05");
assert.equal(getNextReviewDate("2026-05", strategyIds.opportunistic), "2026-05-08");
assert.equal(getNextReviewDate("2026-05", strategyIds.balancedGrowth), "2026-05-31");
assert.equal(getNextReviewDate("not-a-month", strategyIds.balancedGrowth), "Mês inválido");
assert.equal(formatCurrency("1200").replace(/\s/u, " "), "R$ 1.200,00");
assert.equal(formatCurrency("not-a-number"), "R$ 0,00");
assert.equal(normalizeApiBase("https://api.example.test/"), "https://api.example.test");
assert.deepEqual(normalizeConfirmedAmount("1200,50"), { error: null, value: "1200.50" });
assert.deepEqual(normalizeConfirmedAmount("1200.12345678"), {
	error: null,
	value: "1200.12345678",
});
assert.equal(normalizeConfirmedAmount("R$ 1.200,00").error?.includes("decimal positivo"), true);
assert.equal(normalizeConfirmedAmount("-1").error?.includes("decimal positivo"), true);
assert.equal(normalizeConfirmedAmount("texto").error?.includes("decimal positivo"), true);
assert.equal(normalizeConfirmedAmount("0").error?.includes("decimal positivo"), true);

const pendingCycle = createContributionCycle({ status: cycleStatuses.pending });
const confirmedCycle = createContributionCycle({ status: cycleStatuses.confirmed });
const closedCycle = createContributionCycle({ status: cycleStatuses.closed });
const reportedCycle = createContributionCycle({ status: cycleStatuses.reported });
const skippedCycle = createContributionCycle({ status: cycleStatuses.skipped });

assert.equal(isConfirmableCycle(pendingCycle), true);
assert.equal(isConfirmableCycle(confirmedCycle), true);
assert.equal(isConfirmableCycle(closedCycle), false);
assert.equal(isConfirmableCycle(reportedCycle), false);
assert.equal(isConfirmableCycle(skippedCycle), false);
assert.equal(canConfirmContributionCycle(pendingCycle, normalizeConfirmedAmount("1200")), true);
assert.equal(canConfirmContributionCycle(reportedCycle, normalizeConfirmedAmount("1200")), false);
assert.equal(canConfirmContributionCycle(pendingCycle, normalizeConfirmedAmount("texto")), false);

assert.equal(canGenerateContributionReport(confirmedCycle, null), true);
assert.equal(canGenerateContributionReport(confirmedCycle, confirmedCycle.id), false);
assert.equal(canGenerateContributionReport(reportedCycle, null), false);
assert.equal(markCycleReported(confirmedCycle).status, cycleStatuses.reported);
assert.equal(confirmedCycle.status, cycleStatuses.confirmed);

function createContributionCycle(overrides: Partial<ContributionCycle> = {}): ContributionCycle {
	return {
		confirmedAmount: null,
		contributionPlanId: "plan-1",
		cycleMonth: "2026-05",
		id: "cycle-1",
		notes: null,
		plannedAmount: "1200",
		portfolioId: "portfolio-1",
		status: cycleStatuses.pending,
		strategyId: strategyIds.balancedGrowth,
		updatedAt: "2026-05-23T00:00:00.000Z",
		...overrides,
	};
}
