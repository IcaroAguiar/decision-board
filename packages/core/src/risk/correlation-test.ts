import {
	type AnalysisFinding,
	type AnalysisResult,
	createAnalysisResult,
	methodIds,
} from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
import { type Datum, weightsWithCoverage } from "../provenance.js";
import { type MonthlySeries, parseYearMonth, type YearMonth } from "../series.js";
import { approxEqual } from "../units.js";
import { resolveAssumptions, validateAndCollectEvidence } from "./correlation-assumptions.js";
import { addUniqueNote } from "./correlation-notes.js";
import {
	alignLongestSpanUpToEndMonth,
	buildAfterScenarioWeights,
	computePortfolioReturns,
} from "./correlation-portfolio.js";
import { computeRollingCorrelation, computeWindowResults } from "./correlation-windows.js";
import { buildCandidateWorstMonths, rankWorstPortfolioMonths } from "./worst-months.js";

export const correlationTestMethodVersion = "1.0.0";
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
	const hasWorstMonthMetric = candidate.worstMonths.some((entry) => entry.candidateReturn !== null);
	return hasWindowMetric || candidate.rollingCorrelation !== null || hasWorstMonthMetric;
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
	// Antes do início da série mais curta é só histórico menor; depois dele, mês ausente é lacuna.
	const commonStart = activeHoldingSeries
		.map((series) => series.find((point) => point.month <= input.endMonth)?.month)
		.reduce<YearMonth | undefined>(
			(latest, first) =>
				first === undefined ? latest : latest === undefined || first > latest ? first : latest,
			undefined,
		);
	const portfolioGaps = portfolioAligned.missingMonths.filter(
		(month) => commonStart !== undefined && month >= commonStart,
	);
	if (portfolioGaps.length > 0) {
		anyPartial = true;
		const reason = `Retorno da carteira ausente em ${portfolioGaps.length} mês(es) (${portfolioGaps.join(", ")}); esses meses ficaram fora do ranking dos piores meses.`;
		addUniqueNote(notVerified, reason);
		findings.push({ code: "MISSING_PORTFOLIO_RETURNS", severity: "warning", message: reason });
	}
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

		const {
			windowResults,
			longestComplete,
			longestFullOverlap,
			anyPartial: windowsPartial,
		} = computeWindowResults({
			activeHoldingSeries,
			candidate,
			input,
			assumptions,
			activeHoldings,
			activeBeforeWeightsVec,
			activeKeys,
			candidateAlreadyInHoldings,
			afterWeightsVec,
			afterKeys,
			notVerified,
			findings,
		});
		if (windowsPartial) anyPartial = true;

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

		const { worstMonths, missingReasons } = buildCandidateWorstMonths(
			portfolioWorstMonths,
			candidate.key,
			fullAligned.months,
			fullCandidate,
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
