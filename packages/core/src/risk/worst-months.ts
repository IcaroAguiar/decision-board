import type { YearMonth } from "../series.js";
import type { WorstMonthPerformance } from "./correlation-test.js";

interface PortfolioWorstMonth {
	month: YearMonth;
	portfolioReturn: number;
}

export function rankWorstPortfolioMonths(
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

export function buildCandidateWorstMonths(
	portfolioWorstMonths: readonly PortfolioWorstMonth[],
	candidateKey: string,
	alignedMonths: readonly YearMonth[],
	alignedCandidateReturns: readonly number[],
): {
	worstMonths: WorstMonthPerformance[];
	missingReasons: string[];
} {
	const worstMonths: WorstMonthPerformance[] = [];
	const missingReasons: string[] = [];

	for (const entry of portfolioWorstMonths) {
		const monthIndex = alignedMonths.indexOf(entry.month);
		const candidateReturn = monthIndex >= 0 ? alignedCandidateReturns[monthIndex] : undefined;
		if (candidateReturn !== undefined) {
			worstMonths.push({
				month: entry.month,
				portfolioReturn: entry.portfolioReturn,
				candidateReturn,
			});
			continue;
		}
		const reason = `Histórico de ${candidateKey} indisponível em ${entry.month}.`;
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
