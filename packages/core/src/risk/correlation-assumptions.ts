import { collectEvidence, type DataNature, type Datum, type SourceRef } from "../provenance.js";
import { createMonthlySeries } from "../series.js";
import type { CorrelationTestAssumptions, CorrelationTestInput } from "./correlation-test.js";

const defaultWindows = [30, 58] as const;
const defaultRollingWindow = 24;
const defaultWorstMonths = 5;

export function resolveAssumptions(
	raw?: Partial<CorrelationTestAssumptions>,
): CorrelationTestAssumptions {
	const windows = raw?.windows ?? [...defaultWindows];
	const rollingWindow = raw?.rollingWindow ?? defaultRollingWindow;
	const worstMonths = raw?.worstMonths ?? defaultWorstMonths;

	if (windows.length === 0) {
		throw new Error("Informe ao menos uma janela de análise.");
	}
	for (const window of windows) {
		if (!Number.isSafeInteger(window) || window < 3) {
			throw new Error("Cada janela deve ser um inteiro seguro maior ou igual a 3 meses.");
		}
	}
	if (!Number.isSafeInteger(rollingWindow) || rollingWindow < 3) {
		throw new Error("A janela móvel deve ser um inteiro seguro maior ou igual a 3 meses.");
	}
	if (!Number.isSafeInteger(worstMonths) || worstMonths < 1) {
		throw new Error("A quantidade de piores meses deve ser um inteiro seguro positivo.");
	}

	return {
		windows: [...windows],
		rollingWindow,
		worstMonths,
	};
}

export function validateAndCollectEvidence(input: CorrelationTestInput): {
	sources: SourceRef[];
	natures: DataNature[];
	notVerified: string[];
} {
	const datums: Datum<unknown>[] = [input.contribution];
	const candidateKeys = new Set<string>();

	for (const holding of input.holdings) {
		datums.push(holding.value);
		const series = createMonthlySeries(holding.returns);
		const hasPositiveWeight = holding.value.status === "known" && holding.value.value > 0;
		if (!hasPositiveWeight) continue;
		for (const point of series) {
			if (point.month <= input.endMonth) datums.push(point.value);
		}
	}
	for (const candidate of input.candidates) {
		if (candidateKeys.has(candidate.key)) {
			throw new Error("As chaves dos candidatos devem ser únicas.");
		}
		candidateKeys.add(candidate.key);
		const series = createMonthlySeries(candidate.returns);
		for (const point of series) {
			if (point.month <= input.endMonth) datums.push(point.value);
		}
	}

	const evidence = collectEvidence(datums);
	return {
		sources: evidence.sources,
		natures: evidence.natures,
		notVerified: evidence.notVerified,
	};
}
