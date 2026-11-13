import assert from "node:assert/strict";
import test from "node:test";
import {
	annualizeMonthlyVolatility,
	approxEqual,
	covariance,
	mean,
	pearson,
	sampleStdev,
	sampleVariance,
	tryPearson,
} from "../index.js";

function createLcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

function buildExactCorrelatedPair(
	length: number,
	targetRho: number,
	seed: number,
): { xs: number[]; ys: number[] } {
	const rand = createLcg(seed);
	const xs = Array.from({ length }, () => (rand() - 0.5) * 0.12);
	const rawZ = Array.from({ length }, () => (rand() - 0.5) * 0.12);

	const meanX = mean(xs);
	const meanZ = mean(rawZ);
	const xc = xs.map((x) => x - meanX);
	const zc = rawZ.map((z) => z - meanZ);

	let dotXZ = 0;
	let dotXX = 0;
	for (let i = 0; i < length; i += 1) {
		const xi = xc[i] ?? 0;
		const zi = zc[i] ?? 0;
		dotXZ += xi * zi;
		dotXX += xi * xi;
	}
	const proj = dotXZ / dotXX;
	const orthogonal = zc.map((zi, i) => zi - proj * (xc[i] ?? 0));

	const sdX = sampleStdev(xs);
	const sdU = sampleStdev(orthogonal);
	const orthoWeight = Math.sqrt(1 - targetRho * targetRho);
	const ys = xc.map(
		(xi, i) => 0.005 + 0.03 * (targetRho * (xi / sdX) + orthoWeight * ((orthogonal[i] ?? 0) / sdU)),
	);
	return { xs, ys };
}

test("computes sample mean, variance (n-1), stdev, covariance and annualized volatility", () => {
	const xs = [0.05, 0.01, -0.03, 0.01, 0.01];
	const ys = [0.02, 0.06, -0.02, -0.02, 0.06];

	assert.ok(approxEqual(mean(xs), 0.01));
	assert.ok(approxEqual(sampleVariance(xs), 0.0008));
	assert.ok(approxEqual(sampleStdev(xs), Math.sqrt(0.0008)));
	assert.ok(approxEqual(covariance(xs, ys), 0.0004));
	assert.ok(approxEqual(annualizeMonthlyVolatility(Math.sqrt(0.0002)), Math.sqrt(0.0024)));
});

test("R3 acceptance 1: recovers exact target Pearson correlation within 1e-12 tolerance", () => {
	for (const targetRho of [-0.65, 0, 0.42, 0.85]) {
		const { xs, ys } = buildExactCorrelatedPair(58, targetRho, 42);
		const computed = pearson(xs, ys);
		assert.ok(
			approxEqual(computed, targetRho, { relative: 1e-12, absolute: 1e-12 }),
			`Esperado ${targetRho}, obtido ${computed}`,
		);
	}
});

test("validates Pearson inputs and throws on zero variance or length mismatch", () => {
	assert.throws(() => pearson([0.01, 0.02], [0.01, 0.02]), /pelo menos 3/);
	assert.throws(() => pearson([0.01, 0.02, 0.03], [0.01, 0.02]), /mesmo tamanho/);
	assert.throws(() => pearson([0.1, 0.1, 0.1], [0.01, 0.02, 0.03]), /Variância nula/);
	assert.throws(() => pearson([0.01, 0.02, 0.03], [0.05, 0.05, 0.05]), /Variância nula/);
	assert.throws(() => pearson([0.01, Number.NaN, 0.03], [0.01, 0.02, 0.03]), /finitos/);
	assert.throws(() => mean([]), /vazia/);
	assert.throws(() => sampleVariance([0.01]), /pelo menos 2/);
	assert.throws(() => annualizeMonthlyVolatility(-0.1), /não negativo/);
});

test("tryPearson returns null on zero variance while keeping contract checks", () => {
	assert.equal(tryPearson([0.1, 0.1, 0.1], [0.01, 0.02, 0.03]), null);
	assert.equal(tryPearson([0.01, 0.02, 0.03], [0.05, 0.05, 0.05]), null);
	assert.ok(approxEqual(tryPearson([0.01, 0.02, 0.03], [0.02, 0.04, 0.06]) ?? 0, 1));
	assert.throws(() => tryPearson([0.01, 0.02], [0.01, 0.02]), /pelo menos 3/);
	assert.throws(() => tryPearson([0.01, 0.02, 0.03], [0.01, 0.02]), /mesmo tamanho/);
	assert.throws(() => tryPearson([0.01, Number.NaN, 0.03], [0.01, 0.02, 0.03]), /finitos/);
});
