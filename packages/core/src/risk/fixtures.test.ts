import assert from "node:assert/strict";
import {
	addMonths,
	createMonthlySeries,
	known,
	type MonthlySeries,
	mean,
	type SourceRef,
	sampleStdev,
} from "../index.js";

export const officialSource: SourceRef = {
	id: "b3-synthetic",
	label: "Posição B3 Sintética",
	asOf: "2026-10-31",
	official: true,
};

export const unofficialSource: SourceRef = {
	id: "optional-provider",
	label: "Provedor Opcional Sintético",
	asOf: "2026-10-31",
	official: false,
};

export function createLcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

export function toSeries(
	endMonth: string,
	values: readonly number[],
	source: SourceRef = officialSource,
): MonthlySeries {
	const startMonth = addMonths(endMonth, 1 - values.length);
	return createMonthlySeries(
		values.map((value, index) => ({
			month: addMonths(startMonth, index),
			value: known(value, "observed", source),
		})),
	);
}

export function makeExactCorrelatedReturns(
	baseReturns: readonly number[],
	targetRho: number,
	targetMonthlySd: number,
	seed: number,
): number[] {
	const rand = createLcg(seed);
	const rawZ = Array.from({ length: baseReturns.length }, () => (rand() - 0.5) * 0.1);
	const meanX = mean(baseReturns);
	const meanZ = mean(rawZ);
	const xc = baseReturns.map((x) => x - meanX);
	const zc = rawZ.map((z) => z - meanZ);

	let dotXZ = 0;
	let dotXX = 0;
	for (let i = 0; i < baseReturns.length; i += 1) {
		const xi = xc[i] ?? 0;
		const zi = zc[i] ?? 0;
		dotXZ += xi * zi;
		dotXX += xi * xi;
	}
	const proj = dotXZ / dotXX;
	const orthogonal = zc.map((zi, i) => zi - proj * (xc[i] ?? 0));

	const sdX = sampleStdev(baseReturns);
	const sdU = sampleStdev(orthogonal);
	const orthoWeight = Math.sqrt(1 - targetRho * targetRho);
	return xc.map(
		(xi, i) =>
			0.008 +
			targetMonthlySd * (targetRho * (xi / sdX) + orthoWeight * ((orthogonal[i] ?? 0) / sdU)),
	);
}

export function assertNoPrescriptiveWording(
	notVerified: readonly string[],
	findings: readonly { message: string }[],
): void {
	const forbidden = /compr|vend|recomend/i;
	for (const note of notVerified) {
		assert.equal(forbidden.test(note), false, `Texto prescritivo em notVerified: ${note}`);
	}
	for (const finding of findings) {
		assert.equal(
			forbidden.test(finding.message),
			false,
			`Texto prescritivo em finding: ${finding.message}`,
		);
	}
}
