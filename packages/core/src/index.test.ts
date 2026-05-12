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
	assert.equal(summary.assetCount, 2);
	assert.equal(summary.allocationByRiskCategory.paper, 95);
	assert.equal(summary.allocationByRiskCategory.brick, 320);
});
