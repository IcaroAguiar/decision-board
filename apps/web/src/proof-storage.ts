import { storedApiBaseKey, storedPlanIdKey, storedPortfolioIdKey } from "./monthly-contribution.js";

export function readStoredValue(key: string, fallback: string): string {
	if (typeof window === "undefined") {
		return fallback;
	}

	return window.localStorage.getItem(key) ?? fallback;
}

export function persistWorkspace(
	apiBase: string,
	portfolioId: string,
	contributionPlanId: string,
): void {
	window.localStorage.setItem(storedApiBaseKey, apiBase);
	window.localStorage.setItem(storedPortfolioIdKey, portfolioId);
	window.localStorage.setItem(storedPlanIdKey, contributionPlanId);
}
