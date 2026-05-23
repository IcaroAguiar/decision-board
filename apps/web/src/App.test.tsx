import assert from "node:assert/strict";
import { App } from "./App.js";
import {
	formatCurrency,
	getCurrentCycleMonth,
	getNextReviewDate,
	normalizeApiBase,
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
