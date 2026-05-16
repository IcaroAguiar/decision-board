import assert from "node:assert/strict";
import test from "node:test";
import { calculatePortfolioSummary, calculatePositionValue } from "./index.js";

test("calculates position value from quantity and current price", () => {
	assert.equal(
		calculatePositionValue({
			assetId: "asset-1",
			ticker: "CYCR11",
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
			assetId: "asset-1",
			ticker: "CYCR11",
			quantity: 10,
			currentPrice: 9.5,
			riskCategory: "paper",
		},
		{
			assetId: "asset-2",
			ticker: "HGLG11",
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
});

test("includes cash accounts in total value and cash allocation", () => {
	const summary = calculatePortfolioSummary(
		[
			{
				assetId: "asset-1",
				ticker: "CYCR11",
				quantity: 10,
				currentPrice: 9.5,
				riskCategory: "paper",
			},
		],
		[
			{
				id: "cash-1",
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
});
