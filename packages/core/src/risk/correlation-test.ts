import {
	type AnalysisFinding,
	type AnalysisResult,
	createAnalysisResult,
	methodIds,
} from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
import {
	collectEvidence,
	type Datum,
	known,
	type SourceRef,
	weightsWithCoverage,
} from "../provenance.js";
import {
	alignSeries,
	createMonthlySeries,
	type MonthlySeries,
	monthsBetween,
	parseYearMonth,
	type YearMonth,
} from "../series.js";
import { approxEqual } from "../units.js";
import { covarianceMatrix, portfolioVolatility, riskContributions } from "./portfolio-risk.js";
import { annualizeMonthlyVolatility, pearson } from "./statistics.js";

export const correlationTestMethodVersion = "1.0.0";
const defaultWindows = [30, 58] as const;
const defaultRollingWindow = 24;
const defaultWorstMonths = 5;
const pastCorrelationCaveat = "Correlação passada não garante a futura.";

export interface CorrelationHoldingInput {
	key: string;
	value: Datum<number>;
	returns: MonthlySeries;
}

export interface CorrelationCandidateInput {
	key: string;
	returns: MonthlySeries;
}

export interface CorrelationTestAssumptions {
	windows: readonly number[];
	rollingWindow: number;
	worstMonths: number;
}

export interface CorrelationTestInput {
	asOf: string;
	endMonth: YearMonth;
	strategyVersion: string | null;
	holdings: readonly CorrelationHoldingInput[];
	candidates: readonly CorrelationCandidateInput[];
	contribution: Datum<number>;
	assumptions?: Partial<CorrelationTestAssumptions>;
}

export type RiskImpactClassification = "reduz risco" | "aumenta risco" | "inconclusivo";

export type WindowCorrelationResult =
	| {
			window: number;
			status: "complete";
			overlap: number;
			months: YearMonth[];
			correlation: number;
			volatilityBefore: number;
			volatilityAfter: number;
			riskContributionsBefore: Record<string, number>;
			riskContributionsAfter: Record<string, number>;
	  }
	| {
			window: number;
			status: "partial";
			overlap: number;
			months: YearMonth[];
			correlation: null;
			reason: string;
			volatilityBefore: null;
			volatilityAfter: null;
			riskContributionsBefore: null;
			riskContributionsAfter: null;
	  };

export interface RollingCorrelationRange {
	windowMonths: number;
	min: number;
	max: number;
	observations: number;
}

export interface WorstMonthPerformance {
	month: YearMonth;
	portfolioReturn: number;
	candidateReturn: number;
}

export interface CandidateCorrelationOutput {
	key: string;
	classification: RiskImpactClassification;
	longestCompleteWindow: number | null;
	volatilityBefore: number | null;
	volatilityAfter: number | null;
	riskContributionsBefore: Record<string, number> | null;
	riskContributionsAfter: Record<string, number> | null;
	rollingCorrelation: RollingCorrelationRange | null;
	worstMonths: WorstMonthPerformance[];
	windows: WindowCorrelationResult[];
}

export interface CorrelationTestOutput {
	endMonth: YearMonth;
	beforeWeights: Record<string, number>;
	missingHoldingKeys: string[];
	candidates: CandidateCorrelationOutput[];
}

function resolveAssumptions(raw?: Partial<CorrelationTestAssumptions>): CorrelationTestAssumptions {
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

function validateAndCollectEvidence(input: CorrelationTestInput): {
	sources: SourceRef[];
	notVerified: string[];
} {
	const datums: Datum<unknown>[] = [input.contribution];
	const candidateKeys = new Set<string>();

	for (const holding of input.holdings) {
		datums.push(holding.value);
		const series = createMonthlySeries(holding.returns);
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
		notVerified: evidence.notVerified,
	};
}

function addUniqueNote(notes: string[], note: string): void {
	if (!notes.includes(note)) notes.push(note);
}

function computePortfolioReturns(
	holdingValues: readonly (readonly number[])[],
	weights: readonly number[],
): number[] {
	const length = holdingValues[0]?.length ?? 0;
	const portfolioReturns = Array.from({ length }, () => 0);
	for (let assetIndex = 0; assetIndex < holdingValues.length; assetIndex += 1) {
		const weight = weights[assetIndex];
		const assetSeries = holdingValues[assetIndex];
		if (weight === undefined || !assetSeries) continue;
		for (let t = 0; t < length; t += 1) {
			const r = assetSeries[t];
			if (r !== undefined) {
				portfolioReturns[t] = (portfolioReturns[t] ?? 0) + weight * r;
			}
		}
	}
	return portfolioReturns;
}

function mapRiskContributions(
	keys: readonly string[],
	contributions: readonly number[],
): Record<string, number> {
	return Object.fromEntries(keys.map((key, index) => [key, contributions[index] ?? 0]));
}

function buildAfterScenarioWeights(
	knownHoldings: readonly CorrelationHoldingInput[],
	candidateKey: string,
	contribution: Datum<number> & { status: "known" },
): {
	afterKeys: string[];
	afterWeights: Record<string, number>;
	candidateAlreadyInHoldings: boolean;
} {
	const existingIndex = knownHoldings.findIndex((holding) => holding.key === candidateKey);
	if (existingIndex >= 0) {
		const updatedItems = knownHoldings.map((holding, index) => {
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
			afterKeys: knownHoldings.map((holding) => holding.key),
			afterWeights: weights,
			candidateAlreadyInHoldings: true,
		};
	}

	const items = [
		...knownHoldings.map((holding) => ({ key: holding.key, value: holding.value })),
		{ key: candidateKey, value: contribution },
	];
	const { weights } = weightsWithCoverage(items);
	return {
		afterKeys: [...knownHoldings.map((holding) => holding.key), candidateKey],
		afterWeights: weights,
		candidateAlreadyInHoldings: false,
	};
}

function alignLongestSpanUpToEndMonth(
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

function computeRollingCorrelation(
	months: readonly YearMonth[],
	candidateReturns: readonly number[],
	portfolioReturns: readonly number[],
	rollingWindow: number,
): RollingCorrelationRange | null {
	if (months.length < rollingWindow) return null;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let observations = 0;

	for (let start = 0; start <= months.length - rollingWindow; start += 1) {
		const startMonth = months[start];
		const endMonth = months[start + rollingWindow - 1];
		if (startMonth === undefined || endMonth === undefined) continue;
		// Garante que a janela móvel tenha exatamente rollingWindow meses de calendário contíguos.
		if (monthsBetween(startMonth, endMonth) !== rollingWindow - 1) continue;
		const candidateSlice = candidateReturns.slice(start, start + rollingWindow);
		const portfolioSlice = portfolioReturns.slice(start, start + rollingWindow);
		const r = pearson(candidateSlice, portfolioSlice);
		if (r < min) min = r;
		if (r > max) max = r;
		observations += 1;
	}

	if (observations === 0) return null;
	return {
		windowMonths: rollingWindow,
		min,
		max,
		observations,
	};
}

function computeWorstMonths(
	months: readonly YearMonth[],
	portfolioReturns: readonly number[],
	candidateReturns: readonly number[],
	worstCount: number,
): WorstMonthPerformance[] {
	const combined: WorstMonthPerformance[] = [];
	for (let i = 0; i < months.length; i += 1) {
		const month = months[i];
		const portfolioReturn = portfolioReturns[i];
		const candidateReturn = candidateReturns[i];
		if (month === undefined || portfolioReturn === undefined || candidateReturn === undefined) {
			continue;
		}
		combined.push({ month, portfolioReturn, candidateReturn });
	}
	combined.sort((a, b) => {
		const diff = a.portfolioReturn - b.portfolioReturn;
		return diff !== 0 ? diff : a.month.localeCompare(b.month);
	});
	return combined.slice(0, worstCount);
}

export function runCorrelationTest(
	input: CorrelationTestInput,
): AnalysisResult<CorrelationTestInput, CorrelationTestOutput, CorrelationTestAssumptions> {
	parseIsoDate(input.asOf);
	parseYearMonth(input.endMonth);
	const assumptions = resolveAssumptions(input.assumptions);

	if (input.contribution.status === "known") {
		if (!Number.isFinite(input.contribution.value) || input.contribution.value < 0) {
			throw new Error("O valor do aporte deve ser finito e não negativo.");
		}
	}

	const { sources, notVerified } = validateAndCollectEvidence(input);
	addUniqueNote(notVerified, pastCorrelationCaveat);
	const findings: AnalysisFinding[] = [];
	const inconclusive = () =>
		createAnalysisResult<CorrelationTestInput, CorrelationTestOutput, CorrelationTestAssumptions>({
			method: { id: methodIds.correlationTest, version: correlationTestMethodVersion },
			status: "inconclusive",
			strategyVersion: input.strategyVersion,
			asOf: input.asOf,
			inputs: input,
			assumptions,
			sources,
			notVerified,
			findings,
			output: null,
		});

	const weightCoverage = weightsWithCoverage(
		input.holdings.map((holding) => ({ key: holding.key, value: holding.value })),
	);
	for (const missingKey of weightCoverage.missingKeys) {
		const reason = `Saldo atual ausente para a posição ${missingKey}; pesos calculados apenas sobre posições com saldo conhecido.`;
		addUniqueNote(notVerified, reason);
		findings.push({
			code: "MISSING_HOLDING_BALANCE",
			severity: "warning",
			subject: missingKey,
			message: reason,
		});
	}

	if (weightCoverage.coverage === "empty") {
		const message =
			"Nenhuma posição possui saldo conhecido positivo para calcular os pesos da carteira.";
		addUniqueNote(notVerified, message);
		findings.push({
			code: "EMPTY_PORTFOLIO_WEIGHTS",
			severity: "blocked",
			message,
		});
		return inconclusive();
	}

	if (input.contribution.status === "missing") {
		const message = `Valor do aporte ausente para simular o cenário posterior: ${input.contribution.reason}`;
		addUniqueNote(notVerified, message);
		findings.push({
			code: "MISSING_CONTRIBUTION",
			severity: "blocked",
			message,
		});
		return inconclusive();
	}

	if (input.candidates.length === 0) {
		const message = "Nenhum candidato informado para o teste de correlação.";
		addUniqueNote(notVerified, message);
		findings.push({
			code: "NO_CANDIDATES",
			severity: "blocked",
			message,
		});
		return inconclusive();
	}

	const knownHoldings = input.holdings.filter((holding) => holding.value.status === "known");
	const knownKeys = knownHoldings.map((holding) => holding.key);
	const beforeWeightsVec = knownKeys.map((key) => weightCoverage.weights[key] ?? 0);
	const holdingSeries = knownHoldings.map((holding) => holding.returns);

	let anyWindowComplete = false;
	let anyWindowPartial = false;
	const candidateOutputs: CandidateCorrelationOutput[] = [];

	for (const candidate of input.candidates) {
		const { afterKeys, afterWeights, candidateAlreadyInHoldings } = buildAfterScenarioWeights(
			knownHoldings,
			candidate.key,
			input.contribution,
		);
		const afterWeightsVec = afterKeys.map((key) => afterWeights[key] ?? 0);

		const windowResults: WindowCorrelationResult[] = [];
		let longestComplete: Extract<WindowCorrelationResult, { status: "complete" }> | undefined;

		for (const window of assumptions.windows) {
			const aligned = alignSeries([...holdingSeries, candidate.returns], {
				end: input.endMonth,
				months: window,
			});

			if (aligned.overlap < window) {
				anyWindowPartial = true;
				const reason = `Histórico menor que a janela de ${window} meses para ${candidate.key}`;
				addUniqueNote(notVerified, reason);
				findings.push({
					code: "SHORT_HISTORY",
					severity: "warning",
					subject: candidate.key,
					message: `${reason} (${aligned.overlap} de ${window} meses alinhados).`,
				});
				windowResults.push({
					window,
					status: "partial",
					overlap: aligned.overlap,
					months: aligned.months,
					correlation: null,
					reason,
					volatilityBefore: null,
					volatilityAfter: null,
					riskContributionsBefore: null,
					riskContributionsAfter: null,
				});
				continue;
			}

			anyWindowComplete = true;
			const alignedHoldings = aligned.values.slice(0, knownHoldings.length);
			const alignedCandidate = aligned.values[knownHoldings.length] ?? [];
			const portfolioReturns = computePortfolioReturns(alignedHoldings, beforeWeightsVec);
			const correlation = pearson(alignedCandidate, portfolioReturns);

			const covBefore = covarianceMatrix(alignedHoldings);
			const volBefore = annualizeMonthlyVolatility(
				portfolioVolatility(beforeWeightsVec, covBefore),
			);
			const rcBefore = mapRiskContributions(
				knownKeys,
				riskContributions(beforeWeightsVec, covBefore),
			);

			const afterSeries = candidateAlreadyInHoldings
				? alignedHoldings
				: [...alignedHoldings, alignedCandidate];
			const covAfter = covarianceMatrix(afterSeries);
			const volAfter = annualizeMonthlyVolatility(portfolioVolatility(afterWeightsVec, covAfter));
			const rcAfter = mapRiskContributions(afterKeys, riskContributions(afterWeightsVec, covAfter));

			const completeResult: Extract<WindowCorrelationResult, { status: "complete" }> = {
				window,
				status: "complete",
				overlap: aligned.overlap,
				months: aligned.months,
				correlation,
				volatilityBefore: volBefore,
				volatilityAfter: volAfter,
				riskContributionsBefore: rcBefore,
				riskContributionsAfter: rcAfter,
			};
			windowResults.push(completeResult);
			if (longestComplete === undefined || window > longestComplete.window) {
				longestComplete = completeResult;
			}
		}

		const fullAligned = alignLongestSpanUpToEndMonth(
			[...holdingSeries, candidate.returns],
			input.endMonth,
		);
		const fullHoldings = fullAligned.values.slice(0, knownHoldings.length);
		const fullCandidate = fullAligned.values[knownHoldings.length] ?? [];
		const fullPortfolioReturns = computePortfolioReturns(fullHoldings, beforeWeightsVec);

		const rollingCorrelation = computeRollingCorrelation(
			fullAligned.months,
			fullCandidate,
			fullPortfolioReturns,
			assumptions.rollingWindow,
		);
		if (rollingCorrelation === null) {
			addUniqueNote(
				notVerified,
				`Histórico insuficiente para correlação móvel de ${assumptions.rollingWindow} meses para ${candidate.key}.`,
			);
		}

		const worstMonths = computeWorstMonths(
			fullAligned.months,
			fullPortfolioReturns,
			fullCandidate,
			assumptions.worstMonths,
		);
		if (fullAligned.overlap < assumptions.worstMonths) {
			addUniqueNote(
				notVerified,
				`Histórico alinhado (${fullAligned.overlap} meses) menor que os ${assumptions.worstMonths} piores meses solicitados para ${candidate.key}.`,
			);
		}

		let classification: RiskImpactClassification = "inconclusivo";
		if (longestComplete !== undefined) {
			if (approxEqual(longestComplete.volatilityAfter, longestComplete.volatilityBefore)) {
				classification = "inconclusivo";
			} else if (longestComplete.volatilityAfter < longestComplete.volatilityBefore) {
				classification = "reduz risco";
			} else {
				classification = "aumenta risco";
			}
			findings.push({
				code: "CORRELATION_SUMMARY",
				severity: classification === "inconclusivo" ? "warning" : "info",
				subject: candidate.key,
				message: `Cenário simulado para ${candidate.key} na janela de ${longestComplete.window} meses: ${classification} em relação à carteira atual.`,
			});
		} else {
			findings.push({
				code: "INCONCLUSIVE_CANDIDATE",
				severity: "warning",
				subject: candidate.key,
				message: `Nenhuma janela completa disponível para ${candidate.key}; classificação inconclusiva.`,
			});
		}

		candidateOutputs.push({
			key: candidate.key,
			classification,
			longestCompleteWindow: longestComplete?.window ?? null,
			volatilityBefore: longestComplete?.volatilityBefore ?? null,
			volatilityAfter: longestComplete?.volatilityAfter ?? null,
			riskContributionsBefore: longestComplete?.riskContributionsBefore ?? null,
			riskContributionsAfter: longestComplete?.riskContributionsAfter ?? null,
			rollingCorrelation,
			worstMonths,
			windows: windowResults,
		});
	}

	if (!anyWindowComplete) {
		return inconclusive();
	}

	const status = anyWindowPartial || weightCoverage.missingKeys.length > 0 ? "partial" : "complete";

	return createAnalysisResult({
		method: { id: methodIds.correlationTest, version: correlationTestMethodVersion },
		status,
		strategyVersion: input.strategyVersion,
		asOf: input.asOf,
		inputs: input,
		assumptions,
		sources,
		notVerified,
		findings,
		output: {
			endMonth: input.endMonth,
			beforeWeights: weightCoverage.weights,
			missingHoldingKeys: weightCoverage.missingKeys,
			candidates: candidateOutputs,
		},
	});
}
