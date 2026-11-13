import assert from "node:assert/strict";
import test from "node:test";
import {
	type ContributionCandidateInput,
	type ContributionCandidateMetric,
	simulateContributionAllocation,
} from "./index.js";

const assetIds = {
	brick: "asset-brick",
	other: "asset-other",
	paper: "asset-paper",
} as const;

function metricRefs(metrics: ContributionCandidateMetric[]) {
	return metrics.map((metric) => ({
		label: `${metric} source`,
		metric,
	}));
}

function candidate(
	overrides: Partial<ContributionCandidateInput> &
		Pick<ContributionCandidateInput, "assetId" | "ticker">,
): ContributionCandidateInput {
	return {
		currentPrice: 100,
		metricSourceRefs: metricRefs(["price"]),
		riskCategory: "paper",
		...overrides,
	};
}

function auditCodes(result: ReturnType<typeof simulateContributionAllocation>) {
	return result.auditFindings.map((finding) => finding.code);
}

test("allocates whole lots without exceeding contribution amount", () => {
	const result = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper, assetIds.brick],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				currentPrice: 230,
				metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
				targetWeightPercent: 50,
				ticker: "CYCR11",
			}),
			candidate({
				assetId: assetIds.brick,
				currentPrice: 140,
				metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
				riskCategory: "brick",
				targetWeightPercent: 50,
				ticker: "HGLG11",
			}),
		],
		contributionAmount: 1000,
		positions: [],
	});

	assert.equal(result.investedAmount + result.remainingCash, result.contributionAmount);
	assert.equal(result.investedAmount, 880);
	assert.equal(result.remainingCash, 120);
	assert.deepEqual(
		result.orders.map((order) => [order.ticker, order.quantity]),
		[
			["CYCR11", 2],
			["HGLG11", 3],
		],
	);
});

test("chooses candidate that reduces target weight gap", () => {
	const result = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper, assetIds.brick],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
				targetWeightPercent: 50,
				ticker: "CYCR11",
			}),
			candidate({
				assetId: assetIds.brick,
				metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
				riskCategory: "brick",
				targetWeightPercent: 50,
				ticker: "HGLG11",
			}),
		],
		contributionAmount: 100,
		positions: [
			{
				assetId: assetIds.paper,
				currentPrice: 90,
				quantity: 10,
				riskCategory: "paper",
				ticker: "CYCR11",
			},
			{
				assetId: assetIds.brick,
				currentPrice: 100,
				quantity: 1,
				riskCategory: "brick",
				ticker: "HGLG11",
			},
		],
	});

	assert.deepEqual(
		result.orders.map((order) => order.ticker),
		["HGLG11"],
	);
});

test("blocks candidates outside allowed investment universe", () => {
	const result = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper],
		candidates: [
			candidate({
				assetId: assetIds.other,
				ticker: "VINO11",
			}),
		],
		contributionAmount: 100,
		positions: [],
	});

	assert.deepEqual(result.orders, []);
	assert.ok(auditCodes(result).includes("candidate_outside_universe"));
});

test("requires metric source references for decision metrics", () => {
	const blocked = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				metricSourceRefs: [],
				ticker: "CYCR11",
			}),
		],
		contributionAmount: 100,
		positions: [],
	});

	assert.deepEqual(blocked.orders, []);
	assert.ok(auditCodes(blocked).includes("missing_metric_source"));

	const eligible = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				ticker: "CYCR11",
			}),
		],
		contributionAmount: 100,
		positions: [],
	});

	assert.equal(eligible.orders[0]?.ticker, "CYCR11");
});

test("blocks price liquidity and concentration violations", () => {
	const result = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper, assetIds.brick, assetIds.other],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				currentPrice: 120,
				dailyLiquidity: 2000,
				maxPrice: 100,
				metricSourceRefs: metricRefs(["price", "dailyLiquidity", "concentrationPercent"]),
				concentrationPercent: 10,
				ticker: "CYCR11",
			}),
			candidate({
				assetId: assetIds.brick,
				dailyLiquidity: 10,
				metricSourceRefs: metricRefs(["price", "dailyLiquidity", "concentrationPercent"]),
				concentrationPercent: 10,
				riskCategory: "brick",
				ticker: "HGLG11",
			}),
			candidate({
				assetId: assetIds.other,
				dailyLiquidity: 2000,
				metricSourceRefs: metricRefs(["price", "dailyLiquidity", "concentrationPercent"]),
				concentrationPercent: 80,
				ticker: "VINO11",
			}),
		],
		constraints: {
			maxConcentrationPercent: 50,
			minDailyLiquidity: 1000,
		},
		contributionAmount: 1000,
		positions: [],
	});

	assert.deepEqual(result.orders, []);
	assert.ok(auditCodes(result).includes("price_above_limit"));
	assert.ok(auditCodes(result).includes("liquidity_below_minimum"));
	assert.ok(auditCodes(result).includes("concentration_above_limit"));
});

test("records allocation limit reached when next lot would violate limits", () => {
	const result = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				currentPrice: 600,
				metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
				targetWeightPercent: 100,
				ticker: "CYCR11",
			}),
		],
		constraints: {
			maxSingleAssetPercent: 50,
		},
		contributionAmount: 1000,
		positions: [],
	});

	assert.deepEqual(result.orders, []);
	assert.ok(auditCodes(result).includes("allocation_limit_reached"));
});

test("includes existing and remaining cash in post allocation cash bucket", () => {
	const result = simulateContributionAllocation({
		allowedAssetIds: [assetIds.paper],
		candidates: [
			candidate({
				assetId: assetIds.paper,
				currentPrice: 80,
				metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
				targetWeightPercent: 100,
				ticker: "CYCR11",
			}),
		],
		cashAccounts: [
			{
				balance: 200,
				id: "cash-account",
				name: "Reserva",
				type: "CDB",
			},
		],
		contributionAmount: 100,
		positions: [],
	});

	assert.equal(result.remainingCash, 20);
	assert.equal(result.postAllocation.byRiskCategory.cash, 73.33);
	assert.equal(result.postAllocation.bySegment.cash, 73.33);
});

test("rejects invalid numeric inputs", () => {
	assert.throws(
		() =>
			simulateContributionAllocation({
				allowedAssetIds: [assetIds.paper],
				candidates: [candidate({ assetId: assetIds.paper, ticker: "CYCR11" })],
				contributionAmount: 0,
				positions: [],
			}),
		/contributionAmount/,
	);

	assert.throws(
		() =>
			simulateContributionAllocation({
				allowedAssetIds: [assetIds.paper],
				candidates: [
					candidate({
						assetId: assetIds.paper,
						currentPrice: 0,
						ticker: "CYCR11",
					}),
				],
				contributionAmount: 100,
				positions: [],
			}),
		/currentPrice/,
	);

	assert.throws(
		() =>
			simulateContributionAllocation({
				allowedAssetIds: [assetIds.paper],
				candidates: [
					candidate({
						assetId: assetIds.paper,
						metricSourceRefs: metricRefs(["price", "targetWeightPercent"]),
						targetWeightPercent: 101,
						ticker: "CYCR11",
					}),
				],
				contributionAmount: 100,
				positions: [],
			}),
		/targetWeightPercent/,
	);

	assert.throws(
		() =>
			simulateContributionAllocation({
				allowedAssetIds: [assetIds.paper],
				candidates: [
					candidate({
						assetId: assetIds.paper,
						lotSize: 1.5,
						metricSourceRefs: metricRefs(["price", "lotSize"]),
						ticker: "CYCR11",
					}),
				],
				contributionAmount: 100,
				positions: [],
			}),
		/lotSize/,
	);
});
