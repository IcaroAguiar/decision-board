import assert from "node:assert/strict";
import test from "node:test";
import {
	calculateAllocation,
	calculateEstimatedDividends,
	calculatePortfolioSummary,
	calculatePositionValue,
} from "./index.js";

const fixtureIds = {
	paperAsset: "asset-paper",
	brickAsset: "asset-brick",
	otherAsset: "asset-other",
	roundingAsset: "asset-rounding",
	invalidAsset: "asset-invalid",
	cashAccount: "cash-reserve",
} as const;

const fixtureTickers = {
	paper: "CYCR11",
	brick: "HGLG11",
	other: "UNCL11",
	rounding: "ROUND11",
	invalid: "BAD11",
} as const;

test("calculates position value from quantity and current price", () => {
	assert.equal(
		calculatePositionValue({
			assetId: fixtureIds.paperAsset,
			ticker: fixtureTickers.paper,
			quantity: 10,
			currentPrice: 9.5,
			riskCategory: "paper",
		}),
		95,
	);
});

test("summarizes total value and risk allocation", () => {
	const summary = calculatePortfolioSummary([
		{
			assetId: fixtureIds.paperAsset,
			ticker: fixtureTickers.paper,
			quantity: 10,
			currentPrice: 9.5,
			riskCategory: "paper",
		},
		{
			assetId: fixtureIds.brickAsset,
			ticker: fixtureTickers.brick,
			quantity: 2,
			currentPrice: 160,
			riskCategory: "brick",
		},
	]);

	assert.equal(summary.totalValue, 415);
	assert.equal(summary.positionsValue, 415);
	assert.equal(summary.cashValue, 0);
	assert.equal(summary.assetCount, 2);
	assert.equal(summary.cashAccountCount, 0);
	assert.equal(summary.allocationByRiskCategory.paper, 95);
	assert.equal(summary.allocationByRiskCategory.brick, 320);
	assert.equal(summary.allocation.byRiskCategory.paper.percent, 22.89);
	assert.equal(summary.allocation.byRiskCategory.brick.percent, 77.11);
	assert.deepEqual(
		summary.allocation.byAsset.map((asset) => [asset.ticker, asset.value, asset.percent]),
		[
			[fixtureTickers.brick, 320, 77.11],
			[fixtureTickers.paper, 95, 22.89],
		],
	);
});

test("includes cash accounts in total value and cash allocation", () => {
	const summary = calculatePortfolioSummary(
		[
			{
				assetId: fixtureIds.paperAsset,
				ticker: fixtureTickers.paper,
				quantity: 10,
				currentPrice: 9.5,
				riskCategory: "paper",
			},
		],
		[
			{
				id: fixtureIds.cashAccount,
				name: "Reserva diaria",
				balance: 1000.5,
				type: "CDB",
				liquidity: "D+0",
			},
		],
	);

	assert.equal(summary.totalValue, 1095.5);
	assert.equal(summary.positionsValue, 95);
	assert.equal(summary.cashValue, 1000.5);
	assert.equal(summary.assetCount, 1);
	assert.equal(summary.cashAccountCount, 1);
	assert.equal(summary.allocationByRiskCategory.paper, 95);
	assert.equal(summary.allocationByRiskCategory.cash, 1000.5);
	assert.equal(summary.allocation.byRiskCategory.cash.percent, 91.33);
	assert.equal(getSegment(summary.allocation.bySegment, "cash").value, 1000.5);
});

test("calculates allocation by risk category, asset, and segment", () => {
	const allocation = calculateAllocation(
		[
			{
				assetId: fixtureIds.paperAsset,
				ticker: fixtureTickers.paper,
				quantity: 10,
				currentPrice: 10,
				riskCategory: "paper",
				segment: "receivables",
			},
			{
				assetId: fixtureIds.brickAsset,
				ticker: fixtureTickers.brick,
				quantity: 3,
				currentPrice: 100,
				riskCategory: "brick",
				segment: "logistics",
			},
			{
				assetId: fixtureIds.otherAsset,
				ticker: fixtureTickers.other,
				quantity: 1,
				currentPrice: 100,
				riskCategory: "other",
			},
		],
		[
			{
				id: fixtureIds.cashAccount,
				name: "Reserva",
				balance: 500,
				type: "CDB",
			},
		],
	);

	assert.equal(allocation.byRiskCategory.brick.value, 300);
	assert.equal(allocation.byRiskCategory.brick.percent, 30);
	assert.equal(allocation.byRiskCategory.cash.value, 500);
	assert.equal(allocation.byRiskCategory.cash.percent, 50);
	assert.equal(getSegment(allocation.bySegment, "logistics").value, 300);
	assert.equal(getSegment(allocation.bySegment, "receivables").percent, 10);
	assert.equal(getSegment(allocation.bySegment, "unclassified").value, 100);
	assert.deepEqual(
		allocation.byAsset.map((asset) => asset.ticker),
		[fixtureTickers.brick, fixtureTickers.paper, fixtureTickers.other],
	);
});

test("aggregates allocation by asset when a portfolio has duplicate positions", () => {
	const allocation = calculateAllocation([
		{
			assetId: fixtureIds.paperAsset,
			ticker: fixtureTickers.paper,
			quantity: 10,
			currentPrice: 10,
			riskCategory: "paper",
			segment: "receivables",
		},
		{
			assetId: fixtureIds.paperAsset,
			ticker: fixtureTickers.paper,
			quantity: 5,
			currentPrice: 20,
			riskCategory: "paper",
			segment: "receivables",
		},
		{
			assetId: fixtureIds.brickAsset,
			ticker: fixtureTickers.brick,
			quantity: 1,
			currentPrice: 100,
			riskCategory: "brick",
			segment: "logistics",
		},
	]);

	assert.deepEqual(
		allocation.byAsset.map((asset) => [asset.assetId, asset.ticker, asset.value, asset.percent]),
		[
			[fixtureIds.paperAsset, fixtureTickers.paper, 200, 66.67],
			[fixtureIds.brickAsset, fixtureTickers.brick, 100, 33.33],
		],
	);
	assert.equal(allocation.byRiskCategory.paper.value, 200);
	assert.equal(getSegment(allocation.bySegment, "receivables").value, 200);
});

test("rejects inconsistent ticker metadata for the same asset", () => {
	assert.throws(
		() =>
			calculateAllocation([
				{
					assetId: fixtureIds.paperAsset,
					ticker: fixtureTickers.paper,
					quantity: 1,
					currentPrice: 10,
					riskCategory: "paper",
				},
				{
					assetId: fixtureIds.paperAsset,
					ticker: fixtureTickers.brick,
					quantity: 1,
					currentPrice: 10,
					riskCategory: "paper",
				},
			]),
		/position\.ticker/,
	);
});

function getSegment(
	segments: Record<string, { value: number; percent: number }>,
	segment: string,
): { value: number; percent: number } {
	const bucket = segments[segment];
	assert.ok(bucket);
	return bucket;
}

test("calculates estimated monthly and annual dividends when informed", () => {
	const dividends = calculateEstimatedDividends(
		[
			{
				assetId: fixtureIds.paperAsset,
				ticker: fixtureTickers.paper,
				quantity: 10,
				currentPrice: 10,
				riskCategory: "paper",
				estimatedMonthlyDividend: 1.23,
			},
			{
				assetId: fixtureIds.brickAsset,
				ticker: fixtureTickers.brick,
				quantity: 2,
				currentPrice: 100,
				riskCategory: "brick",
				estimatedMonthlyDividend: 2.34,
			},
		],
		300,
	);

	assert.equal(dividends.monthly, 3.57);
	assert.equal(dividends.annual, 42.84);
	assert.equal(dividends.monthlyYieldPercent, 1.19);
	assert.equal(dividends.annualYieldPercent, 14.28);
});

test("returns zero allocations and dividends for an empty portfolio", () => {
	const summary = calculatePortfolioSummary([]);

	assert.equal(summary.totalValue, 0);
	assert.equal(summary.positionsValue, 0);
	assert.equal(summary.cashValue, 0);
	assert.equal(summary.assetCount, 0);
	assert.equal(summary.cashAccountCount, 0);
	assert.deepEqual(summary.allocation.byAsset, []);
	assert.equal(summary.allocation.byRiskCategory.brick.percent, 0);
	assert.equal(summary.allocation.byRiskCategory.cash.percent, 0);
	assert.deepEqual(summary.allocation.bySegment, {});
	assert.deepEqual(summary.estimatedDividends, {
		monthly: 0,
		annual: 0,
		monthlyYieldPercent: 0,
		annualYieldPercent: 0,
	});
});

test("rounds money and percentages deterministically", () => {
	const summary = calculatePortfolioSummary([
		{
			assetId: fixtureIds.roundingAsset,
			ticker: fixtureTickers.rounding,
			quantity: 3,
			currentPrice: 0.1,
			riskCategory: "other",
			estimatedMonthlyDividend: 0.105,
		},
	]);

	assert.equal(summary.totalValue, 0.3);
	assert.equal(summary.positionsValue, 0.3);
	assert.equal(summary.allocation.byRiskCategory.other.percent, 100);
	assert.equal(summary.estimatedDividends.monthly, 0.11);
	assert.equal(summary.estimatedDividends.annual, 1.32);
});

test("rejects non-finite or negative numeric inputs", () => {
	assert.throws(
		() =>
			calculatePositionValue({
				assetId: fixtureIds.invalidAsset,
				ticker: fixtureTickers.invalid,
				quantity: -1,
				currentPrice: 10,
				riskCategory: "other",
			}),
		/position\.quantity/,
	);

	assert.throws(
		() =>
			calculatePortfolioSummary(
				[],
				[
					{
						id: fixtureIds.cashAccount,
						name: "Reserva",
						balance: Number.NaN,
						type: "CDB",
					},
				],
			),
		/cashAccount\.balance/,
	);

	assert.throws(
		() =>
			calculateEstimatedDividends(
				[
					{
						assetId: fixtureIds.paperAsset,
						ticker: fixtureTickers.paper,
						quantity: 1,
						currentPrice: 10,
						riskCategory: "paper",
					},
				],
				Number.NaN,
			),
		/totalValue/,
	);

	assert.throws(() => calculateEstimatedDividends([], -1), /totalValue/);
});
