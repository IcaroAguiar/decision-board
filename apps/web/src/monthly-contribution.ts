export const strategyIds = {
	balancedGrowth: "balanced_growth",
	defensive: "defensive",
	highIncome: "high_income",
	lowMaintenance: "low_maintenance",
	opportunistic: "opportunistic",
} as const;

export type StrategyId = (typeof strategyIds)[keyof typeof strategyIds];

export const cycleStatuses = {
	closed: "closed",
	confirmed: "confirmed",
	pending: "pending",
	reported: "reported",
	skipped: "skipped",
} as const;

export type ContributionCycleStatus = (typeof cycleStatuses)[keyof typeof cycleStatuses];

export interface StrategyOption {
	id: StrategyId;
	name: string;
	reportIntervalDays: number;
}

export interface ContributionPlan {
	id: string;
	amount: string;
	defaultStrategyId: StrategyId;
	nextCycleDate: string | null;
	cashAccountId: string | null;
}

export interface ContributionCycle {
	id: string;
	portfolioId: string;
	contributionPlanId: string;
	cycleMonth: string;
	plannedAmount: string;
	confirmedAmount: string | null;
	status: ContributionCycleStatus;
	strategyId: StrategyId;
	notes: string | null;
	updatedAt: string;
}

export interface CashAccount {
	id: string;
	name: string;
	balance: string;
	liquidity: string | null;
}

export interface SavedReport {
	id: string;
	generatedAt: string;
	strategyId: string | null;
	alertCount: number;
}

export interface ConfirmedAmountValidation {
	error: string | null;
	value: string;
}

export const loadStates = {
	error: "error",
	idle: "idle",
	loading: "loading",
	ready: "ready",
} as const;

export type LoadState = (typeof loadStates)[keyof typeof loadStates];

export const defaultApiBase = import.meta.env?.VITE_API_BASE_URL ?? "";
export const jsonContentTypeHeader = "content-type";
export const storedApiBaseKey = "decision-board.apiBase";
export const storedPortfolioIdKey = "decision-board.portfolioId";
export const storedPlanIdKey = "decision-board.contributionPlanId";

export const strategyOptions: StrategyOption[] = [
	{ id: strategyIds.lowMaintenance, name: "Pouca manutenção", reportIntervalDays: 30 },
	{ id: strategyIds.highIncome, name: "Renda mensal alta", reportIntervalDays: 15 },
	{ id: strategyIds.balancedGrowth, name: "Crescimento equilibrado", reportIntervalDays: 30 },
	{ id: strategyIds.opportunistic, name: "Oportunista", reportIntervalDays: 7 },
	{ id: strategyIds.defensive, name: "Defensiva", reportIntervalDays: 30 },
];

export const defaultStrategyOption: StrategyOption = {
	id: strategyIds.balancedGrowth,
	name: "Crescimento equilibrado",
	reportIntervalDays: 30,
};

export const statusLabels: Record<ContributionCycleStatus, string> = {
	[cycleStatuses.closed]: "Fechado",
	[cycleStatuses.confirmed]: "Confirmado",
	[cycleStatuses.pending]: "Pendente",
	[cycleStatuses.reported]: "Reportado",
	[cycleStatuses.skipped]: "Pulado",
};

const cycleMonthTextLength = 7;
const isoDateTextLength = 10;
const monthTextLength = 2;
const currencyLocale = "pt-BR";
const fallbackCurrencyText = "R$ 0,00";
const moneyDecimalPattern = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;

export function getCurrentCycleMonth(now = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(monthTextLength, "0");
	return `${now.getFullYear()}-${month}`.slice(0, cycleMonthTextLength);
}

export function getNextReviewDate(cycleMonth: string, strategyId: StrategyId): string {
	const strategy = getStrategy(strategyId);
	const [yearText, monthText] = cycleMonth.split("-");
	const cycleStart = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));

	if (Number.isNaN(cycleStart.getTime())) {
		return "Mês inválido";
	}

	cycleStart.setUTCDate(cycleStart.getUTCDate() + strategy.reportIntervalDays);
	return cycleStart.toISOString().slice(0, isoDateTextLength);
}

export function formatCurrency(value: number | string | null | undefined): string {
	const amount = Number(value ?? 0);

	if (!Number.isFinite(amount)) {
		return fallbackCurrencyText;
	}

	return new Intl.NumberFormat(currencyLocale, {
		currency: "BRL",
		style: "currency",
	}).format(amount);
}

export function getStrategy(strategyId: StrategyId): StrategyOption {
	return strategyOptions.find((strategy) => strategy.id === strategyId) ?? defaultStrategyOption;
}

export function normalizeConfirmedAmount(value: string): ConfirmedAmountValidation {
	const trimmed = value.trim();

	if (!trimmed) {
		return { error: "Informe o valor confirmado do aporte.", value: "" };
	}

	const normalized = trimmed.replace(",", ".");

	if (!moneyDecimalPattern.test(normalized) || Number(normalized) <= 0) {
		return {
			error: "Informe um decimal positivo, sem símbolo de moeda ou separador de milhar.",
			value: "",
		};
	}

	return { error: null, value: normalized };
}

export function isConfirmableCycle(cycle: ContributionCycle | null): boolean {
	return cycle?.status === cycleStatuses.pending || cycle?.status === cycleStatuses.confirmed;
}

export function canConfirmContributionCycle(
	cycle: ContributionCycle | null,
	amount: ConfirmedAmountValidation,
): boolean {
	return Boolean(cycle) && isConfirmableCycle(cycle) && amount.error === null;
}

export function canGenerateContributionReport(
	cycle: ContributionCycle | null,
	lastReportCycleId: string | null,
): boolean {
	return (
		Boolean(cycle) && cycle?.status === cycleStatuses.confirmed && cycle.id !== lastReportCycleId
	);
}

export function markCycleReported(cycle: ContributionCycle): ContributionCycle {
	return {
		...cycle,
		status: cycleStatuses.reported,
		updatedAt: new Date().toISOString(),
	};
}

export function normalizeApiBase(value: string): string {
	const trimmed = value.trim() || defaultApiBase;
	return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function upsertCycle(
	cycles: ContributionCycle[],
	nextCycle: ContributionCycle,
): ContributionCycle[] {
	const existing = cycles.findIndex((cycle) => cycle.id === nextCycle.id);

	if (existing === -1) {
		return [nextCycle, ...cycles];
	}

	return cycles.map((cycle) => (cycle.id === nextCycle.id ? nextCycle : cycle));
}
