export const jobNames = {
	createMonthlyContributionCycles: "createMonthlyContributionCycles",
	checkReportDue: "checkReportDue",
} as const;

export type JobName = (typeof jobNames)[keyof typeof jobNames];

export const jobSchedules = {
	createMonthlyContributionCyclesCron: "0 3 * * *",
	checkReportDueCron: "0 4 * * *",
	timeZone: "UTC",
} as const;

export interface CreateMonthlyContributionCyclesJobData {
	cycleMonth?: string;
}

export interface CheckReportDueJobData {
	now?: string;
}

export const reportRecommendationReasons = {
	strategyReportIntervalElapsed: "strategy_report_interval_elapsed",
} as const;
