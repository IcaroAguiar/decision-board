import assert from "node:assert/strict";
import test from "node:test";
import { HealthController } from "./health.controller.js";

test("returns a stable health response", () => {
	const controller = new HealthController();

	assert.deepEqual(controller.getHealth(), {
		status: "ok",
		service: "decision-board-api",
	});
});
