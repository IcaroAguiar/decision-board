import assert from "node:assert/strict";
import test from "node:test";
import type { ContributionCandidateMetric } from "./index.js";
import {
	type PartContributionCandidate,
	type PartContributionInput,
	type SimulationAuditFinding,
	simulateContributionAllocation,
} from "./index.js";

const metrics: ContributionCandidateMetric[] = [
	"price",
	"part",
	"lotSize",
	"dailyLiquidity",
	"concentration",
];
function candidate(overrides: Partial<PartContributionCandidate> = {}): PartContributionCandidate {
	return {
		assetId: "synthetic-goal",
		ticker: "SYN1",
		currentPrice: 100,
		part: "goal",
		assetClass: "synthetic",
		institution: "synthetic",
		metricSourceRefs: metrics.map(
			(metric) =>
				({
					metric,
					label: "Fonte sintética",
				}) satisfies PartContributionCandidate["metricSourceRefs"][number],
		),
		...overrides,
	};
}
function fixture(overrides: Partial<PartContributionInput> = {}): PartContributionInput {
	return {
		positions: [],
		contributionAmount: 1000,
		allowedAssetIds: ["synthetic-goal", "synthetic-equities"],
		candidates: [candidate()],
		minOperationValue: 0,
		partTargets: {
			reserve: { target: 0, band: { min: 0, max: 0 } },
			goal: { target: 1, band: { min: 0, max: 1 } },
			variableIncome: { target: 0, band: { min: 0, max: 1 } },
		},
		...overrides,
	};
}
const codes = (result: ReturnType<typeof simulateContributionAllocation>) =>
	result.auditFindings.map((finding) => finding.code);

test("whole lots preserve the contribution budget", () => {
	const result = simulateContributionAllocation(
		fixture({ candidates: [candidate({ currentPrice: 140, lotSize: 3 })] }),
	);
	assert.deepEqual(
		result.planItems.map((item) => [item.quantity, item.estimatedValue]),
		[[6, 840]],
	);
	assert.equal(result.investedAmount, 840);
	assert.equal(result.remainingCash, 160);
	assert.equal(result.investedAmount + result.remainingCash, 1000);
});
test("chooses the candidate reducing the part target gap", () => {
	const input = fixture({
		contributionAmount: 100,
		positions: [
			{
				assetId: "synthetic-goal",
				part: "goal",
				value: 900,
				assetClass: "synthetic",
				institution: "synthetic",
			},
			{
				assetId: "synthetic-equities",
				part: "variableIncome",
				value: 100,
				assetClass: "synthetic",
				institution: "synthetic",
			},
		],
		candidates: [
			candidate(),
			candidate({ assetId: "synthetic-equities", ticker: "SYN2", part: "variableIncome" }),
		],
	});
	input.partTargets.goal.target = 0.5;
	input.partTargets.variableIncome.target = 0.5;
	const result = simulateContributionAllocation(input);
	assert.deepEqual(
		result.planItems.map((item) => [item.assetId, item.quantity]),
		[["synthetic-equities", 1]],
	);
});
test("blocks assets outside the allowed universe", () => {
	const result = simulateContributionAllocation(fixture({ allowedAssetIds: [] }));
	assert.deepEqual(result.planItems, []);
	assert.ok(codes(result).includes("candidate_outside_universe"));
});
test("requires sources for each metric used in a decision", () => {
	for (const metric of ["price", "part", "lotSize", "dailyLiquidity", "concentration"]) {
		const result = simulateContributionAllocation(
			fixture({
				minDailyLiquidity: 1,
				maxConcentration: 0.5,
				candidates: [
					candidate({
						lotSize: 1,
						dailyLiquidity: 100,
						concentration: 0.1,
						metricSourceRefs: candidate().metricSourceRefs.filter(
							(source) => source.metric !== metric,
						),
					}),
				],
			}),
		);
		assert.deepEqual(result.planItems, []);
		assert.ok(
			result.auditFindings.some(
				(finding) => finding.code === "missing_metric_source" && finding.metric === metric,
			),
		);
	}
	assert.equal(simulateContributionAllocation(fixture()).planItems[0]?.quantity, 10);
});
test("blocks price, liquidity and concentration violations", () => {
	for (const [overrides, code] of [
		[{ maxPrice: 99 }, "price_above_limit"],
		[{ dailyLiquidity: 10 }, "liquidity_below_minimum"],
		[{ concentration: 0.8 }, "concentration_above_limit"],
	] satisfies [Partial<PartContributionCandidate>, SimulationAuditFinding["code"]][]) {
		const result = simulateContributionAllocation(
			fixture({
				minDailyLiquidity: 1000,
				maxConcentration: 0.5,
				candidates: [candidate({ dailyLiquidity: 2000, concentration: 0.1, ...overrides })],
			}),
		);
		assert.deepEqual(result.planItems, []);
		assert.ok(codes(result).includes(code));
	}
});
test("records allocation limits for each concentration dimension", () => {
	for (const concentrationLimits of [
		{ perAsset: 0.25 },
		{ perClass: 0.25 },
		{ perInstitution: 0.25 },
	]) {
		const result = simulateContributionAllocation(fixture({ concentrationLimits }));
		assert.equal(result.investedAmount, 200);
		assert.equal(result.remainingCash, 800);
		assert.ok(codes(result).includes("allocation_limit_reached"));
	}
});
test("post-allocation includes reserve holdings and unallocated contribution cash", () => {
	const result = simulateContributionAllocation(
		fixture({
			contributionAmount: 100,
			positions: [
				{
					assetId: "synthetic-reserve",
					part: "reserve",
					value: 200,
					assetClass: "cash",
					institution: "synthetic",
				},
			],
			candidates: [candidate({ currentPrice: 80 })],
		}),
	);
	assert.equal(result.remainingCash, 20);
	assert.equal(result.postAllocation.totalValue, 300);
	assert.equal(result.postAllocation.byPart.reserve, 2 / 3);
	assert.equal(result.postAllocation.byPart.goal, 80 / 300);
	assert.equal(result.postAllocation.cash, 20 / 300);
	assert.equal(result.postAllocation.bySegment.cash, 20 / 300);
});
test("rejects invalid numeric inputs and decimal fractions outside their domain", () => {
	for (const contributionAmount of [-1, NaN, Infinity])
		assert.throws(
			() => simulateContributionAllocation(fixture({ contributionAmount })),
			/contributionAmount/,
		);
	for (const overrides of [
		{ currentPrice: 0 },
		{ currentPrice: NaN },
		{ lotSize: 1.5 },
		{ lotSize: 0 },
		{ priority: -1 },
		{ maxPrice: Infinity },
		{ dailyLiquidity: -1 },
		{ concentration: 1.1 },
		{ estimatedMonthlyDividendPerUnit: -1 },
	])
		assert.throws(() =>
			simulateContributionAllocation(fixture({ candidates: [candidate(overrides)] })),
		);
	assert.throws(
		() => simulateContributionAllocation(fixture({ minOperationValue: -1 })),
		/minOperationValue/,
	);
	const input = fixture();
	input.partTargets.goal.target = 50;
	assert.throws(() => simulateContributionAllocation(input), /fração/);
	assert.deepEqual(
		simulateContributionAllocation(fixture({ contributionAmount: 0 })).planItems,
		[],
	);
});
test("missing constrained metrics remain blocked even with source references", () => {
	const result = simulateContributionAllocation(
		fixture({ minDailyLiquidity: 0, maxConcentration: 1 }),
	);
	assert.deepEqual(result.planItems, []);
	assert.deepEqual(
		result.auditFindings
			.filter((finding) => finding.code === "missing_metric")
			.map((finding) => finding.metric),
		["dailyLiquidity", "concentration"],
	);
});
test("fractional prices are not rounded while allocating", () => {
	const result = simulateContributionAllocation(
		fixture({ contributionAmount: 1, candidates: [candidate({ currentPrice: 0.333 })] }),
	);
	assert.equal(result.planItems[0]?.quantity, 3);
	assert.equal(result.planItems[0]?.estimatedValue, 0.9990000000000001);
	assert.ok(result.investedAmount <= 1);
});
test("rejects an overshooting lot even when it would reduce the absolute gap", () => {
	const input = fixture({
		contributionAmount: 1000,
		candidates: [candidate({ currentPrice: 600 })],
	});
	input.partTargets.goal = { target: 0.5, band: { min: 0.45, max: 0.55 } };
	input.partTargets.variableIncome = { target: 0.5, band: { min: 0, max: 1 } };
	assert.deepEqual(simulateContributionAllocation(input).planItems, []);
});
test("class target changes the choice within the same portfolio part", () => {
	const input = fixture({
		contributionAmount: 100,
		positions: [
			{ assetId: "held", part: "goal", value: 100, assetClass: "full", institution: "i" },
		],
		candidates: [
			candidate({ assetClass: "full", priority: 0 }),
			candidate({ assetId: "synthetic-equities", ticker: "SYN2", assetClass: "empty" }),
		],
		classTargets: {
			full: { target: 0.5, band: { min: 0, max: 1 } },
			empty: { target: 0.5, band: { min: 0, max: 1 } },
		},
	});
	assert.equal(simulateContributionAllocation(input).planItems[0]?.ticker, "SYN2");
});
test("a lot cannot worsen one dimension even when summed improvement is positive", () => {
	const result = simulateContributionAllocation(
		fixture({
			contributionAmount: 100,
			positions: [
				{ assetId: "held", part: "goal", value: 100, assetClass: "full", institution: "i" },
				{
					assetId: "other",
					part: "variableIncome",
					value: 100,
					assetClass: "other",
					institution: "i",
				},
			],
			partTargets: {
				reserve: { target: 0, band: { min: 0, max: 0 } },
				goal: { target: 0.8, band: { min: 0, max: 1 } },
				variableIncome: { target: 0.2, band: { min: 0, max: 1 } },
			},
			classTargets: { full: { target: 0.45, band: { min: 0, max: 1 } } },
			candidates: [candidate({ assetClass: "full" })],
		}),
	);
	assert.deepEqual(result.planItems, []);
});
test("concentration tolerates float noise at boundary but rejects the next lot", () => {
	const result = simulateContributionAllocation(
		fixture({
			contributionAmount: 1,
			candidates: [candidate({ currentPrice: 0.1, issuer: "issuer" })],
			concentrationLimits: { perIssuer: 0.3 - 1e-14 },
		}),
	);
	assert.equal(result.planItems[0]?.quantity, 3);
	assert.ok(
		result.auditFindings.some(
			(finding) => finding.code === "allocation_limit_reached" && finding.severity === "info",
		),
	);
	assert.ok(Math.abs((result.postAllocation.byIssuer.issuer ?? 0) - 0.3) < 1e-12);
});
test("decimal prices that exactly exhaust the budget leave no phantom cash", () => {
	const result = simulateContributionAllocation(
		fixture({ contributionAmount: 0.3, candidates: [candidate({ currentPrice: 0.1 })] }),
	);
	assert.deepEqual(
		result.planItems.map((item) => item.quantity),
		[3],
	);
	assert.equal(result.remainingCash, 0);
	assert.ok(!codes(result).includes("cash_unallocated"));
});
