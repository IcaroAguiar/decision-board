import { approxEqual } from "../units.js";
import { covariance, sampleVariance } from "./statistics.js";

function assertSquareMatrix(
	weights: readonly number[],
	matrix: readonly (readonly number[])[],
): void {
	if (weights.length === 0) {
		throw new Error("A carteira precisa de ao menos um ativo.");
	}
	for (const weight of weights) {
		if (!Number.isFinite(weight)) {
			throw new Error("Todos os pesos da carteira devem ser finitos.");
		}
	}
	if (matrix.length !== weights.length) {
		throw new Error("A matriz de covariância deve ter a mesma dimensão dos pesos.");
	}
	for (const row of matrix) {
		if (row.length !== weights.length) {
			throw new Error("A matriz de covariância deve ser quadrada.");
		}
		for (const entry of row) {
			if (!Number.isFinite(entry)) {
				throw new Error("A matriz de covariância deve conter apenas números finitos.");
			}
		}
	}
}

function matrixVectorMultiply(
	matrix: readonly (readonly number[])[],
	weights: readonly number[],
): number[] {
	return matrix.map((row) => {
		let total = 0;
		for (let j = 0; j < weights.length; j += 1) {
			const entry = row[j];
			const weight = weights[j];
			if (entry !== undefined && weight !== undefined) {
				total += entry * weight;
			}
		}
		return total;
	});
}

export function covarianceMatrix(series: readonly (readonly number[])[]): number[][] {
	if (series.length === 0) return [];
	const expectedLength = series[0]?.length ?? 0;
	for (const assetSeries of series) {
		if (assetSeries.length !== expectedLength) {
			throw new Error("Todas as séries da matriz de covariância devem ter o mesmo tamanho.");
		}
	}
	const matrix: number[][] = Array.from({ length: series.length }, () =>
		Array.from({ length: series.length }, () => 0),
	);
	for (let i = 0; i < series.length; i += 1) {
		const rowI = series[i];
		const targetRowI = matrix[i];
		if (!rowI || !targetRowI) continue;
		targetRowI[i] = sampleVariance(rowI);
		for (let j = i + 1; j < series.length; j += 1) {
			const rowJ = series[j];
			const targetRowJ = matrix[j];
			if (!rowJ || !targetRowJ) continue;
			const cov = covariance(rowI, rowJ);
			targetRowI[j] = cov;
			targetRowJ[i] = cov;
		}
	}
	return matrix;
}

export function portfolioVolatility(
	weights: readonly number[],
	matrix: readonly (readonly number[])[],
): number {
	assertSquareMatrix(weights, matrix);
	const sigmaW = matrixVectorMultiply(matrix, weights);
	let variance = 0;
	for (let i = 0; i < weights.length; i += 1) {
		const weight = weights[i];
		const marginal = sigmaW[i];
		if (weight !== undefined && marginal !== undefined) {
			variance += weight * marginal;
		}
	}
	if (!Number.isFinite(variance)) {
		throw new Error("A variância da carteira excede o intervalo numérico finito.");
	}
	if (variance < 0) {
		if (approxEqual(variance, 0, { absolute: 1e-12 })) return 0;
		throw new Error("Matriz de covariância inválida: variância da carteira negativa.");
	}
	return Math.sqrt(variance);
}

export function riskContributions(
	weights: readonly number[],
	matrix: readonly (readonly number[])[],
): number[] {
	assertSquareMatrix(weights, matrix);
	const sigmaW = matrixVectorMultiply(matrix, weights);
	let portfolioVariance = 0;
	const weightedMarginal: number[] = [];
	for (let i = 0; i < weights.length; i += 1) {
		const weight = weights[i];
		const marginal = sigmaW[i];
		if (weight === undefined || marginal === undefined) continue;
		const contribution = weight * marginal;
		weightedMarginal.push(contribution);
		portfolioVariance += contribution;
	}
	if (!Number.isFinite(portfolioVariance) || portfolioVariance <= 0) {
		throw new Error("Variância nula ou inválida impede o cálculo da contribuição ao risco.");
	}
	return weightedMarginal.map((value) => value / portfolioVariance);
}
