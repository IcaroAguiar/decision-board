import assert from "node:assert/strict";
import test from "node:test";
import { JobsRepository } from "./jobs.repository.js";
import { JobsService } from "./jobs.service.js";

type WorkerHandler = (jobs: { data: Record<string, unknown> }[]) => Promise<unknown[]>;

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

function readWorkerHandler(service: JobsService, methodName: string): WorkerHandler {
	const handler = Reflect.get(service, methodName);
	assert.equal(typeof handler, "function");

	return handler.bind(service) as WorkerHandler;
}

test("requires a database URL when jobs are enabled at module startup", async () => {
	const originalJobsEnabled = process.env.JOBS_ENABLED;
	const originalDatabaseUrl = process.env.DATABASE_URL;
	process.env.JOBS_ENABLED = "true";
	delete process.env.DATABASE_URL;

	try {
		const jobs = new JobsService(new JobsRepository());

		await assert.rejects(jobs.onModuleInit(), /DATABASE_URL is required/);
		await jobs.onModuleDestroy();
	} finally {
		restoreEnv("JOBS_ENABLED", originalJobsEnabled);
		restoreEnv("DATABASE_URL", originalDatabaseUrl);
	}
});

test("worker handlers process each job payload through the repository", async () => {
	const cycleInputs: unknown[] = [];
	const reportInputs: unknown[] = [];
	const repository = new JobsRepository();
	repository.createMonthlyContributionCycles = async (data = {}) => {
		cycleInputs.push(data);
		return {
			cycleMonth: data.cycleMonth ?? "default",
			consideredPlans: cycleInputs.length,
			createdCycles: 1,
		};
	};
	repository.checkReportDue = async (data) => {
		reportInputs.push(data);
		return {
			checkedCycles: reportInputs.length,
			markedCycles: 1,
			skippedUnknownStrategies: 0,
		};
	};
	const jobs = new JobsService(repository);
	const handleCycleJobs = readWorkerHandler(jobs, "handleCreateMonthlyContributionCycleJobs");
	const handleReportJobs = readWorkerHandler(jobs, "handleCheckReportDueJobs");

	const cycleResults = await handleCycleJobs([
		{ data: { cycleMonth: "2099-05" } },
		{ data: { cycleMonth: "2099-06" } },
	]);
	const reportResults = await handleReportJobs([
		{ data: { now: "2099-06-15T00:00:00.000Z" } },
		{ data: { now: "2099-07-15T00:00:00.000Z" } },
	]);

	assert.deepEqual(cycleInputs, [{ cycleMonth: "2099-05" }, { cycleMonth: "2099-06" }]);
	assert.deepEqual(reportInputs, [
		{ now: "2099-06-15T00:00:00.000Z" },
		{ now: "2099-07-15T00:00:00.000Z" },
	]);
	assert.deepEqual(cycleResults, [
		{ cycleMonth: "2099-05", consideredPlans: 1, createdCycles: 1 },
		{ cycleMonth: "2099-06", consideredPlans: 2, createdCycles: 1 },
	]);
	assert.deepEqual(reportResults, [
		{ checkedCycles: 1, markedCycles: 1, skippedUnknownStrategies: 0 },
		{ checkedCycles: 2, markedCycles: 1, skippedUnknownStrategies: 0 },
	]);
});
