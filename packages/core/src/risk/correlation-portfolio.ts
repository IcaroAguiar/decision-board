import { type Datum, known, weightsWithCoverage } from "../provenance.js";
import { alignSeries, type MonthlySeries, monthsBetween, type YearMonth } from "../series.js";
import type { CorrelationHoldingInput } from "./correlation-test.js";

export function computePortfolioReturns(
	holdingValues: readonly (readonly number[])[],
	weights: readonly number[],
): number[] {
	const length = holdingValues[0]?.length ?? 0;
	const portfolioReturns = Array.from({ length }, () => 0);
	for (let assetIndex = 0; assetIndex < holdingValues.length; assetIndex += 1) {
		const weight = weights[assetIndex];
		const assetSeries = holdingValues[assetIndex];
		if (weight === undefined || !assetSeries) continue;
		for (let monthIndex = 0; monthIndex < length; monthIndex += 1) {
			const returnValue = assetSeries[monthIndex];
			if (returnValue !== undefined) {
				portfolioReturns[monthIndex] = (portfolioReturns[monthIndex] ?? 0) + weight * returnValue;
			}
		}
	}
	return portfolioReturns;
}

export function buildAfterScenarioWeights(
	activeHoldings: readonly CorrelationHoldingInput[],
	candidateKey: string,
	contribution: Datum<number> & { status: "known" },
): {
	afterKeys: string[];
	afterWeights: Record<string, number>;
	candidateAlreadyInHoldings: boolean;
} {
	const existingIndex = activeHoldings.findIndex((holding) => holding.key === candidateKey);
	if (existingIndex >= 0) {
		const updatedItems = activeHoldings.map((holding, index) => {
			if (index !== existingIndex || holding.value.status !== "known") {
				return { key: holding.key, value: holding.value };
			}
			return {
				key: holding.key,
				value: known(
					holding.value.value + contribution.value,
					contribution.nature,
					contribution.source,
				),
			};
		});
		const { weights } = weightsWithCoverage(updatedItems);
		return {
			afterKeys: activeHoldings.map((holding) => holding.key),
			afterWeights: weights,
			candidateAlreadyInHoldings: true,
		};
	}

	const items = [
		...activeHoldings.map((holding) => ({ key: holding.key, value: holding.value })),
		{ key: candidateKey, value: contribution },
	];
	const { weights } = weightsWithCoverage(items);
	return {
		afterKeys: [...activeHoldings.map((holding) => holding.key), candidateKey],
		afterWeights: weights,
		candidateAlreadyInHoldings: false,
	};
}

export function alignLongestSpanUpToEndMonth(
	seriesList: readonly MonthlySeries[],
	endMonth: YearMonth,
): ReturnType<typeof alignSeries> {
	let earliest: YearMonth | undefined;
	for (const series of seriesList) {
		for (const point of series) {
			if (point.month <= endMonth && (earliest === undefined || point.month < earliest)) {
				earliest = point.month;
			}
		}
	}
	if (earliest === undefined) {
		return alignSeries([]);
	}
	const spanMonths = monthsBetween(earliest, endMonth) + 1;
	return alignSeries(seriesList, { end: endMonth, months: spanMonths });
}
