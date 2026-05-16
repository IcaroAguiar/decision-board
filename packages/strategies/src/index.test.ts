import assert from "node:assert/strict";
import test from "node:test";
import { strategyAlertCodes } from "@decision-board/types";
import { evaluateStrategy, getStrategyById, strategies } from "./index.js";

test("defines the five MVP strategies", () => {
	assert.equal(strategies.length, 5);
});

test("looks up low maintenance strategy metadata", () => {
	assert.equal(getStrategyById("low_maintenance").reportIntervalDays, 30);
});

test("evaluates every MVP strategy deterministically", () => {
	const portfolio = {
		positions: [
			{
				assetId: "asset-1",
				ticker: "HGLG11",
				quantity: 10,
				currentPrice: 100,
				riskCategory: "brick" as const,
				segment: "logistics",
			},
		],
		cashAccounts: [
			{
				id: "cash-1",
				name: "Reserva",
				balance: 250,
				type: "CDB",
				liquidity: "D+0",
			},
		],
	};

	for (const strategy of strategies) {
		const result = evaluateStrategy(portfolio, strategy);
		assert.equal(result.strategyId, strategy.id);
		assert.equal(result.totalValue, 1250);
		assert.equal(result.alerts[0]?.code, strategyAlertCodes.reviewCadence);
	}
});

test("alerts low maintenance allocation mismatches", () => {
	const result = evaluateStrategy(
		{
			positions: [
				{
					assetId: "asset-1",
					ticker: "CYCR11",
					quantity: 50,
					currentPrice: 10,
					riskCategory: "paper",
					segment: "receivables",
				},
				{
					assetId: "asset-2",
					ticker: "HGLG11",
					quantity: 10,
					currentPrice: 20,
					riskCategory: "brick",
					segment: "logistics",
				},
			],
		},
		getStrategyById("low_maintenance"),
	);

	assert.deepEqual(
		result.alerts.map((alert) => alert.code),
		[
			strategyAlertCodes.reviewCadence,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.maxPaperHybridPercent,
			strategyAlertCodes.minBrickPercent,
			strategyAlertCodes.maxSectorPercent,
		],
	);
});

test("alerts cash and checklist requirements for opportunistic strategy", () => {
	const result = evaluateStrategy(
		{
			positions: [
				{
					assetId: "asset-1",
					ticker: "OPP11",
					quantity: 10,
					currentPrice: 100,
					riskCategory: "hybrid",
				},
			],
		},
		getStrategyById("opportunistic"),
	);

	assert.deepEqual(
		result.alerts.map((alert) => alert.code),
		[
			strategyAlertCodes.reviewCadence,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.minCashPercent,
			strategyAlertCodes.manualReviewRequired,
			strategyAlertCodes.riskChecklistRequired,
		],
	);
});

test("alerts high income and defensive risk exposure", () => {
	const highIncome = evaluateStrategy(
		{
			positions: [
				{
					assetId: "asset-1",
					ticker: "PAPER11",
					quantity: 70,
					currentPrice: 10,
					riskCategory: "paper",
				},
				{
					assetId: "asset-2",
					ticker: "BRICK11",
					quantity: 30,
					currentPrice: 10,
					riskCategory: "brick",
				},
			],
		},
		getStrategyById("high_income"),
	);
	assert.deepEqual(
		highIncome.alerts.map((alert) => alert.code),
		[
			strategyAlertCodes.reviewCadence,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.maxPaperHybridPercent,
			strategyAlertCodes.manualReviewRequired,
		],
	);

	const defensive = evaluateStrategy(
		{
			positions: [
				{
					assetId: "asset-1",
					ticker: "PAPER11",
					quantity: 30,
					currentPrice: 10,
					riskCategory: "paper",
				},
				{
					assetId: "asset-2",
					ticker: "BRICK11",
					quantity: 70,
					currentPrice: 10,
					riskCategory: "brick",
				},
			],
		},
		getStrategyById("defensive"),
	);
	assert.deepEqual(
		defensive.alerts.map((alert) => alert.code),
		[
			strategyAlertCodes.reviewCadence,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.maxSingleAssetPercent,
			strategyAlertCodes.maxPaperHybridPercent,
			strategyAlertCodes.minCashPercent,
		],
	);
});

test("returns only cadence for an empty balanced growth portfolio", () => {
	const result = evaluateStrategy(
		{
			positions: [],
			cashAccounts: [],
		},
		getStrategyById("balanced_growth"),
	);

	assert.equal(result.totalValue, 0);
	assert.deepEqual(
		result.alerts.map((alert) => alert.code),
		[strategyAlertCodes.reviewCadence],
	);
});

test("keeps global review alerts for an empty opportunistic portfolio", () => {
	const result = evaluateStrategy(
		{
			positions: [],
			cashAccounts: [],
		},
		getStrategyById("opportunistic"),
	);

	assert.equal(result.totalValue, 0);
	assert.deepEqual(
		result.alerts.map((alert) => alert.code),
		[
			strategyAlertCodes.reviewCadence,
			strategyAlertCodes.manualReviewRequired,
			strategyAlertCodes.riskChecklistRequired,
		],
	);
});
