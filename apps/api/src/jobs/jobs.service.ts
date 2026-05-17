import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Job, PgBoss, type QueueOptions, type SendOptions, type WorkOptions } from "pg-boss";
import {
	type CheckReportDueJobData,
	type CreateMonthlyContributionCyclesJobData,
	jobNames,
	jobSchedules,
} from "./job-names.js";
import {
	type CheckReportDueResult,
	type CreateMonthlyContributionCyclesResult,
	JobsRepository,
} from "./jobs.repository.js";

const JOBS_ENABLED_VALUE = "true";
const PG_BOSS_SCHEMA = "pgboss";
const PG_BOSS_APPLICATION_NAME = "decision-board-api-jobs";
const DAILY_CYCLE_MATERIALIZATION_KEY = "daily-cycle-materialization";
const DAILY_REPORT_DUE_CHECK_KEY = "daily-report-due-check";
const DAILY_SINGLETON_SECONDS = 24 * 60 * 60;

export interface StartJobsOptions {
	registerWorkers?: boolean;
	registerSchedules?: boolean;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
	private boss: PgBoss | null = null;

	constructor(
		@Inject(JobsRepository)
		private readonly jobsRepository: JobsRepository,
	) {}

	async onModuleInit(): Promise<void> {
		if (isJobsEnabled(process.env.JOBS_ENABLED)) {
			await this.start();
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.stop();
	}

	async start(options: StartJobsOptions = {}): Promise<void> {
		if (this.boss) {
			return;
		}

		const boss = createPgBoss(resolveDatabaseUrl());
		boss.on("error", (error) => {
			console.error(
				JSON.stringify({
					component: "jobs",
					event: "pg_boss_error",
					error: sanitizeJobError(error),
				}),
			);
		});

		await boss.start();
		this.boss = boss;

		await this.registerQueues();

		if (options.registerWorkers !== false) {
			await this.registerWorkers();
		}

		if (options.registerSchedules !== false) {
			await this.registerSchedules();
		}
	}

	async stop(): Promise<void> {
		if (!this.boss) {
			return;
		}

		const boss = this.boss;
		this.boss = null;
		await boss.stop({ graceful: true, timeout: 30_000 });
	}

	runCreateMonthlyContributionCycles(
		data: CreateMonthlyContributionCyclesJobData = {},
	): Promise<CreateMonthlyContributionCyclesResult> {
		return this.jobsRepository.createMonthlyContributionCycles(data);
	}

	runCheckReportDue(data: CheckReportDueJobData = {}): Promise<CheckReportDueResult> {
		return this.jobsRepository.checkReportDue(data);
	}

	async enqueueCreateMonthlyContributionCycles(
		data: CreateMonthlyContributionCyclesJobData = {},
	): Promise<string | null> {
		return this.requireBoss().send(jobNames.createMonthlyContributionCycles, data, {
			...standardJobOptions(),
			singletonKey: data.cycleMonth ?? new Date().toISOString().slice(0, 7),
			singletonSeconds: DAILY_SINGLETON_SECONDS,
		});
	}

	async enqueueCheckReportDue(data: CheckReportDueJobData = {}): Promise<string | null> {
		return this.requireBoss().send(jobNames.checkReportDue, data, {
			...standardJobOptions(),
			singletonKey: data.now?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
			singletonSeconds: DAILY_SINGLETON_SECONDS,
		});
	}

	private async registerQueues(): Promise<void> {
		const boss = this.requireBoss();
		await boss.createQueue(jobNames.createMonthlyContributionCycles, standardQueueOptions());
		await boss.createQueue(jobNames.checkReportDue, standardQueueOptions());
	}

	private async registerWorkers(): Promise<void> {
		const boss = this.requireBoss();

		await boss.work<CreateMonthlyContributionCyclesJobData>(
			jobNames.createMonthlyContributionCycles,
			workerOptions(),
			(jobs) => this.handleCreateMonthlyContributionCycleJobs(jobs),
		);
		await boss.work<CheckReportDueJobData>(jobNames.checkReportDue, workerOptions(), (jobs) =>
			this.handleCheckReportDueJobs(jobs),
		);
	}

	private async registerSchedules(): Promise<void> {
		const boss = this.requireBoss();

		await boss.schedule(
			jobNames.createMonthlyContributionCycles,
			jobSchedules.createMonthlyContributionCyclesCron,
			{},
			{
				...standardJobOptions(),
				key: DAILY_CYCLE_MATERIALIZATION_KEY,
				singletonKey: DAILY_CYCLE_MATERIALIZATION_KEY,
				singletonSeconds: DAILY_SINGLETON_SECONDS,
				tz: jobSchedules.timeZone,
			},
		);
		await boss.schedule(
			jobNames.checkReportDue,
			jobSchedules.checkReportDueCron,
			{},
			{
				...standardJobOptions(),
				key: DAILY_REPORT_DUE_CHECK_KEY,
				singletonKey: DAILY_REPORT_DUE_CHECK_KEY,
				singletonSeconds: DAILY_SINGLETON_SECONDS,
				tz: jobSchedules.timeZone,
			},
		);
	}

	private async handleCreateMonthlyContributionCycleJobs(
		jobs: Job<CreateMonthlyContributionCyclesJobData>[],
	): Promise<CreateMonthlyContributionCyclesResult[]> {
		const results: CreateMonthlyContributionCyclesResult[] = [];

		for (const job of jobs) {
			results.push(await this.runCreateMonthlyContributionCycles(job.data));
		}

		return results;
	}

	private async handleCheckReportDueJobs(
		jobs: Job<CheckReportDueJobData>[],
	): Promise<CheckReportDueResult[]> {
		const results: CheckReportDueResult[] = [];

		for (const job of jobs) {
			results.push(await this.runCheckReportDue(job.data));
		}

		return results;
	}

	private requireBoss(): PgBoss {
		if (!this.boss) {
			throw new Error("Jobs service has not been started");
		}

		return this.boss;
	}
}

function createPgBoss(connectionString: string): PgBoss {
	return new PgBoss({
		application_name: PG_BOSS_APPLICATION_NAME,
		connectionString,
		createSchema: true,
		migrate: true,
		schedule: true,
		schema: PG_BOSS_SCHEMA,
		supervise: true,
	});
}

function resolveDatabaseUrl(): string {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required when JOBS_ENABLED is true");
	}

	return databaseUrl;
}

function isJobsEnabled(value: string | undefined): boolean {
	return value?.toLowerCase() === JOBS_ENABLED_VALUE;
}

function standardQueueOptions(): QueueOptions {
	return {
		deleteAfterSeconds: 7 * DAILY_SINGLETON_SECONDS,
		expireInSeconds: 15 * 60,
		retryBackoff: true,
		retryDelay: 30,
		retryLimit: 2,
	};
}

function standardJobOptions(): SendOptions {
	return {
		deleteAfterSeconds: 7 * DAILY_SINGLETON_SECONDS,
		expireInSeconds: 15 * 60,
		retryBackoff: true,
		retryDelay: 30,
		retryLimit: 2,
	};
}

function workerOptions(): WorkOptions {
	return {
		batchSize: 1,
		localConcurrency: 1,
		pollingIntervalSeconds: 30,
	};
}

function sanitizeJobError(error: Error): string {
	const databaseUrl = process.env.DATABASE_URL;
	const message = `${error.name}: ${error.message}`;

	return databaseUrl ? message.replaceAll(databaseUrl, "[redacted-database-url]") : message;
}
