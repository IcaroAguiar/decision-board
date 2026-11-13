import assert from "node:assert/strict";
import test from "node:test";
import { approxEqual, covarianceMatrix, portfolioVolatility, riskContributions } from "../index.js";

test("R3 acceptance 2: matches hand-computed 3-asset covariance matrix and portfolio volatility", () => {
	const r1 = [0.05, 0.01, -0.03, 0.01, 0.01];
	const r2 = [0.02, 0.06, -0.02, -0.02, 0.06];
	const r3 = [-0.02, 0.02, 0.06, 0.02, 0.02];
	const weights = [0.5, 0.25, 0.25];

	const matrix = covarianceMatrix([r1, r2, r3]);
	const expectedMatrix = [
		[0.0008, 0.0004, -0.0008],
		[0.0004, 0.0016, -0.0004],
		[-0.0008, -0.0004, 0.0008],
	];

	for (let i = 0; i < 3; i += 1) {
		for (let j = 0; j < 3; j += 1) {
			assert.ok(
				approxEqual(matrix[i]?.[j] ?? Number.NaN, expectedMatrix[i]?.[j] ?? Number.NaN, {
					relative: 1e-12,
					absolute: 1e-15,
				}),
			);
		}
	}

	// wᵀΣw = 0.5*0.0003 + 0.25*0.0005 + 0.25*(-0.0003) = 0.0002
	const vol = portfolioVolatility(weights, matrix);
	assert.ok(approxEqual(vol, Math.sqrt(0.0002), { relative: 1e-12, absolute: 1e-15 }));

	const contributions = riskContributions(weights, matrix);
	const expectedContributions = [0.75, 0.625, -0.375];
	for (let i = 0; i < 3; i += 1) {
		assert.ok(
			approxEqual(contributions[i] ?? Number.NaN, expectedContributions[i] ?? Number.NaN, {
				relative: 1e-12,
				absolute: 1e-15,
			}),
		);
	}
	assert.ok(
		approxEqual(
			contributions.reduce((acc, value) => acc + value, 0),
			1,
			{ relative: 1e-12, absolute: 1e-15 },
		),
	);
});

test("riskContributions match hand values and sum to 1 for a 2-asset portfolio", () => {
	const r1 = [0.05, 0.01, -0.03, 0.01, 0.01];
	const r2 = [0.02, 0.06, -0.02, -0.02, 0.06];
	const weights = [0.5, 0.5];
	const matrix = covarianceMatrix([r1, r2]);

	// Σw = [0.0006, 0.0010], wᵀΣw = 0.0008 => [0.375, 0.625]
	const contributions = riskContributions(weights, matrix);
	assert.ok(approxEqual(contributions[0] ?? Number.NaN, 0.375));
	assert.ok(approxEqual(contributions[1] ?? Number.NaN, 0.625));
	assert.ok(approxEqual((contributions[0] ?? 0) + (contributions[1] ?? 0), 1));
});

test("validates matrix dimensions and rejects degenerate or invalid inputs", () => {
	assert.deepEqual(covarianceMatrix([]), []);
	assert.throws(() => covarianceMatrix([[0.01, 0.02], [0.01]]), /mesmo tamanho/);
	assert.throws(() => portfolioVolatility([], []), /ao menos um ativo/);
	assert.throws(
		() =>
			portfolioVolatility(
				[1],
				[
					[0.01, 0],
					[0, 0.01],
				],
			),
		/mesma dimensão/,
	);
	assert.throws(() => portfolioVolatility([0.5, 0.5], [[0.01], [0.01]]), /quadrada/);
	assert.throws(() => portfolioVolatility([1], [[-0.01]]), /negativa/);
	assert.throws(() => riskContributions([1], [[0]]), /Variância nula/);
});
