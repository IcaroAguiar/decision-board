import type { AnalysisFinding } from "../analysis.js";
import { alignSeries, type MonthlySeries, monthsBetween, type YearMonth } from "../series.js";
import { addUniqueNote } from "./correlation-notes.js";
import { computePortfolioReturns } from "./correlation-portfolio.js";
import type {
	CorrelationCandidateInput,
	CorrelationHoldingInput,
	RollingCorrelationRange,
	WindowCorrelationResult,
} from "./correlation-test.js";
import { covarianceMatrix, portfolioVolatility, tryRiskContributions } from "./portfolio-risk.js";
import { annualizeMonthlyVolatility, tryPearson } from "./statistics.js";

interface RollingComputationResult {
	range: RollingCorrelationRange | null;
	eligibleSubwindows: number;
	skippedZeroVarianceCount: number;
}

function mapRiskContributions(
	keys: readonly string[],
	contributions: readonly number[],
): Record<string, number> {
	return Object.fromEntries(keys.map((key, index) => [key, contributions[index] ?? 0]));
}

export function computeRollingCorrelation(
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

export function computeWindowResults({
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
}: {
	activeHoldingSeries: MonthlySeries[];
	candidate: CorrelationCandidateInput;
	input: { endMonth: YearMonth };
	assumptions: { windows: readonly number[] };
	activeHoldings: CorrelationHoldingInput[];
	activeBeforeWeightsVec: number[];
	activeKeys: string[];
	candidateAlreadyInHoldings: boolean;
	afterWeightsVec: number[];
	afterKeys: string[];
	notVerified: string[];
	findings: AnalysisFinding[];
}) {
	let anyPartial = false;
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

	return { windowResults, longestComplete, longestFullOverlap, anyPartial };
}
