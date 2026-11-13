import {
	type AnalysisFinding,
	type AnalysisResult,
	createAnalysisResult,
	methodIds,
} from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
import {
	collectEvidence,
	type DataNature,
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
import { covarianceMatrix, portfolioVolatility, tryRiskContributions } from "./portfolio-risk.js";
import { annualizeMonthlyVolatility, tryPearson } from "./statistics.js";

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
			correlation: number | null;
			reason: string;
			volatilityBefore: number | null;
			volatilityAfter: number | null;
			riskContributionsBefore: Record<string, number> | null;
			riskContributionsAfter: Record<string, number> | null;
	  };

export interface RollingCorrelationRange {
	windowMonths: number;
	min: number;
	max: number;
	observations: number;
}

export type WorstMonthPerformance =
	| {
			month: YearMonth;
			portfolioReturn: number;
			candidateReturn: number;
	  }
	| {
			month: YearMonth;
			portfolioReturn: number;
			candidateReturn: null;
			reason: string;
	  };

export interface CandidateCorrelationOutput {
	key: string;
	classification: RiskImpactClassification;
	afterWeights: Record<string, number>;
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

interface PortfolioWorstMonth {
	month: YearMonth;
	portfolioReturn: number;
}

interface RollingComputationResult {
	range: RollingCorrelationRange | null;
	eligibleSubwindows: number;
	skippedZeroVarianceCount: number;
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
		for (let monthIndex = 0; monthIndex < length; monthIndex += 1) {
			const returnValue = assetSeries[monthIndex];
			if (returnValue !== undefined) {
				portfolioReturns[monthIndex] = (portfolioReturns[monthIndex] ?? 0) + weight * returnValue;
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
): RollingComputationResult {
	if (months.length < rollingWindow) {
		return { range: null, eligibleSubwindows: 0, skippedZeroVarianceCount: 0 };
	}
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let observations = 0;
	let eligibleSubwindows = 0;
	let skippedZeroVarianceCount = 0;

	for (let start = 0; start <= months.length - rollingWindow; start += 1) {
		const startMonth = months[start];
		const endMonth = months[start + rollingWindow - 1];
		if (startMonth === undefined || endMonth === undefined) continue;
		// Garante que a janela móvel tenha exatamente rollingWindow meses de calendário contíguos.
		if (monthsBetween(startMonth, endMonth) !== rollingWindow - 1) continue;
		eligibleSubwindows += 1;
		const candidateSlice = candidateReturns.slice(start, start + rollingWindow);
		const portfolioSlice = portfolioReturns.slice(start, start + rollingWindow);
		const correlation = tryPearson(candidateSlice, portfolioSlice);
		if (correlation === null) {
			skippedZeroVarianceCount += 1;
			continue;
		}
		if (correlation < min) min = correlation;
		if (correlation > max) max = correlation;
		observations += 1;
	}

	if (observations === 0) {
		return { range: null, eligibleSubwindows, skippedZeroVarianceCount };
	}
	return {
		range: {
			windowMonths: rollingWindow,
			min,
			max,
			observations,
		},
		eligibleSubwindows,
		skippedZeroVarianceCount,
	};
}

function rankWorstPortfolioMonths(
	months: readonly YearMonth[],
	portfolioReturns: readonly number[],
	worstCount: number,
): PortfolioWorstMonth[] {
	const ranked: PortfolioWorstMonth[] = [];
	for (let index = 0; index < months.length; index += 1) {
		const month = months[index];
		const portfolioReturn = portfolioReturns[index];
		if (month === undefined || portfolioReturn === undefined) continue;
		ranked.push({ month, portfolioReturn });
	}
	ranked.sort((left, right) => {
		const diff = left.portfolioReturn - right.portfolioReturn;
		return diff !== 0 ? diff : left.month.localeCompare(right.month);
	});
	return ranked.slice(0, worstCount);
}

function buildCandidateWorstMonths(
	portfolioWorstMonths: readonly PortfolioWorstMonth[],
	candidateKey: string,
	candidateByMonth: ReadonlyMap<YearMonth, Datum<number>>,
): {
	worstMonths: WorstMonthPerformance[];
	missingReasons: string[];
} {
	const worstMonths: WorstMonthPerformance[] = [];
	const missingReasons: string[] = [];

	for (const entry of portfolioWorstMonths) {
		const datum = candidateByMonth.get(entry.month);
		if (datum?.status === "known") {
			worstMonths.push({
				month: entry.month,
				portfolioReturn: entry.portfolioReturn,
				candidateReturn: datum.value,
			});
			continue;
		}
		const reason =
			datum?.status === "missing"
				? `Retorno de ${candidateKey} ausente em ${entry.month}: ${datum.reason}`
				: `Histórico de ${candidateKey} indisponível em ${entry.month}.`;
		missingReasons.push(reason);
		worstMonths.push({
			month: entry.month,
			portfolioReturn: entry.portfolioReturn,
			candidateReturn: null,
			reason,
		});
	}

	return { worstMonths, missingReasons };
}

function hasAnyComputableMetric(candidate: CandidateCorrelationOutput): boolean {
	const hasWindowMetric = candidate.windows.some(
		(windowResult) =>
			windowResult.status === "complete" ||
			windowResult.correlation !== null ||
			windowResult.volatilityBefore !== null ||
			windowResult.volatilityAfter !== null ||
			windowResult.riskContributionsBefore !== null ||
			windowResult.riskContributionsAfter !== null,
	);
	return (
		hasWindowMetric || candidate.rollingCorrelation !== null || candidate.worstMonths.length > 0
	);
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

	const { sources, natures, notVerified } = validateAndCollectEvidence(input);
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
			natures,
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

	// Posições com saldo conhecido nulo não afetam os retornos e não exigem série histórica.
	const activeHoldings = input.holdings.filter(
		(holding) => holding.value.status === "known" && holding.value.value > 0,
	);
	const activeKeys = activeHoldings.map((holding) => holding.key);
	const activeBeforeWeightsVec = activeKeys.map((key) => weightCoverage.weights[key] ?? 0);
	const activeHoldingSeries = activeHoldings.map((holding) => holding.returns);

	const portfolioAligned = alignLongestSpanUpToEndMonth(activeHoldingSeries, input.endMonth);
	const portfolioFullReturns = computePortfolioReturns(
		portfolioAligned.values,
		activeBeforeWeightsVec,
	);
	const portfolioWorstMonths = rankWorstPortfolioMonths(
		portfolioAligned.months,
		portfolioFullReturns,
		assumptions.worstMonths,
	);

	let anyPartial = false;
	if (portfolioAligned.overlap < assumptions.worstMonths) {
		anyPartial = true;
		const reason = `Histórico alinhado da carteira (${portfolioAligned.overlap} meses) menor que os ${assumptions.worstMonths} piores meses solicitados.`;
		addUniqueNote(notVerified, reason);
		findings.push({
			code: "SHORT_WORST_MONTHS_HISTORY",
			severity: "warning",
			message: reason,
		});
	}

	const candidateOutputs: CandidateCorrelationOutput[] = [];

	for (const candidate of input.candidates) {
		const { afterKeys, afterWeights, candidateAlreadyInHoldings } = buildAfterScenarioWeights(
			activeHoldings,
			candidate.key,
			input.contribution,
		);
		const afterWeightsVec = afterKeys.map((key) => afterWeights[key] ?? 0);

		const windowResults: WindowCorrelationResult[] = [];
		let longestComplete: Extract<WindowCorrelationResult, { status: "complete" }> | undefined;
		let longestFullOverlap: WindowCorrelationResult | undefined;

		for (const window of assumptions.windows) {
			const aligned = alignSeries([...activeHoldingSeries, candidate.returns], {
				end: input.endMonth,
				months: window,
			});

			if (aligned.overlap < window) {
				anyPartial = true;
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

			const alignedHoldings = aligned.values.slice(0, activeHoldings.length);
			const alignedCandidate = aligned.values[activeHoldings.length] ?? [];
			const portfolioReturns = computePortfolioReturns(alignedHoldings, activeBeforeWeightsVec);
			const correlation = tryPearson(alignedCandidate, portfolioReturns);

			const covBefore = covarianceMatrix(alignedHoldings);
			const volBefore = annualizeMonthlyVolatility(
				portfolioVolatility(activeBeforeWeightsVec, covBefore),
			);
			const rcBeforeVec = tryRiskContributions(activeBeforeWeightsVec, covBefore);
			const rcBefore = rcBeforeVec === null ? null : mapRiskContributions(activeKeys, rcBeforeVec);

			const afterSeries = candidateAlreadyInHoldings
				? alignedHoldings
				: [...alignedHoldings, alignedCandidate];
			const covAfter = covarianceMatrix(afterSeries);
			const volAfter = annualizeMonthlyVolatility(portfolioVolatility(afterWeightsVec, covAfter));
			const rcAfterVec = tryRiskContributions(afterWeightsVec, covAfter);
			const rcAfter = rcAfterVec === null ? null : mapRiskContributions(afterKeys, rcAfterVec);

			const unavailableReasons: string[] = [];
			if (correlation === null) {
				unavailableReasons.push("correlação indefinida por variância nula");
			}
			if (rcBefore === null) {
				unavailableReasons.push("contribuição ao risco atual indefinida por variância nula");
			}
			if (rcAfter === null) {
				unavailableReasons.push("contribuição ao risco simulada indefinida por variância nula");
			}

			if (
				correlation !== null &&
				rcBefore !== null &&
				rcAfter !== null &&
				unavailableReasons.length === 0
			) {
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
				if (longestFullOverlap === undefined || window > longestFullOverlap.window) {
					longestFullOverlap = completeResult;
				}
			} else {
				anyPartial = true;
				const reason = `Janela de ${window} meses para ${candidate.key} com cálculo parcial (${unavailableReasons.join("; ")}).`;
				addUniqueNote(notVerified, reason);
				findings.push({
					code: "ZERO_VARIANCE",
					severity: "warning",
					subject: candidate.key,
					message: reason,
				});
				const partialWindowResult: Extract<WindowCorrelationResult, { status: "partial" }> = {
					window,
					status: "partial",
					overlap: aligned.overlap,
					months: aligned.months,
					correlation,
					reason,
					volatilityBefore: volBefore,
					volatilityAfter: volAfter,
					riskContributionsBefore: rcBefore,
					riskContributionsAfter: rcAfter,
				};
				windowResults.push(partialWindowResult);
				if (longestFullOverlap === undefined || window > longestFullOverlap.window) {
					longestFullOverlap = partialWindowResult;
				}
			}
		}

		const fullAligned = alignLongestSpanUpToEndMonth(
			[...activeHoldingSeries, candidate.returns],
			input.endMonth,
		);
		const fullHoldings = fullAligned.values.slice(0, activeHoldings.length);
		const fullCandidate = fullAligned.values[activeHoldings.length] ?? [];
		const fullPortfolioReturns = computePortfolioReturns(fullHoldings, activeBeforeWeightsVec);

		const rollingComputation = computeRollingCorrelation(
			fullAligned.months,
			fullCandidate,
			fullPortfolioReturns,
			assumptions.rollingWindow,
		);
		const rollingCorrelation = rollingComputation.range;
		if (rollingComputation.eligibleSubwindows === 0) {
			anyPartial = true;
			addUniqueNote(
				notVerified,
				`Histórico insuficiente para correlação móvel de ${assumptions.rollingWindow} meses para ${candidate.key}.`,
			);
		} else if (rollingCorrelation === null) {
			anyPartial = true;
			const reason = `Variância nula impediu o cálculo da correlação móvel de ${assumptions.rollingWindow} meses para ${candidate.key}.`;
			addUniqueNote(notVerified, reason);
			findings.push({
				code: "ZERO_VARIANCE",
				severity: "warning",
				subject: candidate.key,
				message: reason,
			});
		} else if (rollingComputation.skippedZeroVarianceCount > 0) {
			anyPartial = true;
			const reason = `Variância nula em ${rollingComputation.skippedZeroVarianceCount} subjanela(s) móvel(is) de ${assumptions.rollingWindow} meses para ${candidate.key}.`;
			addUniqueNote(notVerified, reason);
			findings.push({
				code: "ZERO_VARIANCE",
				severity: "warning",
				subject: candidate.key,
				message: reason,
			});
		}

		const candidateByMonth = new Map(
			createMonthlySeries(candidate.returns)
				.filter((point) => point.month <= input.endMonth)
				.map((point) => [point.month, point.value]),
		);
		const { worstMonths, missingReasons } = buildCandidateWorstMonths(
			portfolioWorstMonths,
			candidate.key,
			candidateByMonth,
		);
		if (missingReasons.length > 0) {
			anyPartial = true;
			for (const reason of missingReasons) {
				addUniqueNote(notVerified, reason);
				findings.push({
					code: "MISSING_WORST_MONTH_CANDIDATE_RETURN",
					severity: "warning",
					subject: candidate.key,
					message: reason,
				});
			}
		}

		const summaryWindow = longestComplete ?? longestFullOverlap;
		let classification: RiskImpactClassification = "inconclusivo";
		if (
			summaryWindow !== undefined &&
			summaryWindow.volatilityBefore !== null &&
			summaryWindow.volatilityAfter !== null
		) {
			if (approxEqual(summaryWindow.volatilityAfter, summaryWindow.volatilityBefore)) {
				classification = "inconclusivo";
			} else if (summaryWindow.volatilityAfter < summaryWindow.volatilityBefore) {
				classification = "reduz risco";
			} else {
				classification = "aumenta risco";
			}
			findings.push({
				code: "CORRELATION_SUMMARY",
				severity: classification === "inconclusivo" ? "warning" : "info",
				subject: candidate.key,
				message: `Cenário simulado para ${candidate.key} na janela de ${summaryWindow.window} meses: ${classification} em relação à carteira atual.`,
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
			afterWeights,
			longestCompleteWindow: longestComplete?.window ?? null,
			volatilityBefore: summaryWindow?.volatilityBefore ?? null,
			volatilityAfter: summaryWindow?.volatilityAfter ?? null,
			riskContributionsBefore: summaryWindow?.riskContributionsBefore ?? null,
			riskContributionsAfter: summaryWindow?.riskContributionsAfter ?? null,
			rollingCorrelation,
			worstMonths,
			windows: windowResults,
		});
	}

	if (!candidateOutputs.some(hasAnyComputableMetric)) {
		const message =
			"Nenhuma métrica de risco ou histórico mínimo pôde ser calculada para os candidatos.";
		addUniqueNote(notVerified, message);
		findings.push({
			code: "NO_COMPUTABLE_METRICS",
			severity: "blocked",
			message,
		});
		return inconclusive();
	}

	const status = anyPartial || weightCoverage.missingKeys.length > 0 ? "partial" : "complete";

	return createAnalysisResult({
		method: { id: methodIds.correlationTest, version: correlationTestMethodVersion },
		status,
		strategyVersion: input.strategyVersion,
		asOf: input.asOf,
		inputs: input,
		assumptions,
		sources,
		natures,
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
