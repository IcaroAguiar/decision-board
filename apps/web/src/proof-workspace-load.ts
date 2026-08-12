import { apiRequest } from "./api-client.js";
import type {
	AssetSummary,
	CashAccount,
	ContributionCycle,
	ContributionPlan,
	PositionSummary,
	ReportHistoryItem,
} from "./monthly-contribution.js";

export async function loadProofWorkspaceData(apiBase: string, portfolioId: string) {
	return Promise.all([
		apiRequest<ContributionPlan[]>(apiBase, `/portfolios/${portfolioId}/contribution-plans`),
		apiRequest<ContributionCycle[]>(apiBase, `/portfolios/${portfolioId}/contribution-cycles`),
		apiRequest<CashAccount[]>(apiBase, `/portfolios/${portfolioId}/cash-accounts`),
		apiRequest<PositionSummary[]>(apiBase, `/portfolios/${portfolioId}/positions`),
		apiRequest<AssetSummary[]>(apiBase, "/assets?limit=50"),
		apiRequest<ReportHistoryItem[]>(apiBase, `/portfolios/${portfolioId}/reports`),
	]);
}
