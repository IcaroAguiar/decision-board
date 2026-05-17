#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coverageDirectory = join(rootDirectory, "coverage");
const lcovPath = join(coverageDirectory, "lcov.info");
const summaryPath = join(coverageDirectory, "coverage-summary.json");

function run(command, args) {
	console.log(`$ ${[command, ...args].join(" ")}`);
	const result = spawnSync(command, args, {
		cwd: rootDirectory,
		env: process.env,
		stdio: "inherit",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function walk(directory) {
	if (!existsSync(directory)) {
		return [];
	}

	const entries = readdirSync(directory)
		.map((entry) => join(directory, entry))
		.sort();

	return entries.flatMap((entry) => {
		if (statSync(entry).isDirectory()) {
			return walk(entry);
		}

		return [entry];
	});
}

function findCompiledTestFiles() {
	const roots = [join(rootDirectory, "apps", "api", "dist"), join(rootDirectory, "packages")];

	return roots
		.flatMap(walk)
		.filter((file) => file.endsWith(".test.js"))
		.filter((file) => file.includes(`${sep}dist${sep}`))
		.filter((file) => !file.split(sep).includes("node_modules"))
		.map((file) => relative(rootDirectory, file).split(sep).join("/"))
		.sort();
}

function emptyMetric() {
	return { total: 0, covered: 0, skipped: 0, pct: 100 };
}

function metric(total, covered) {
	const pct = total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
	return { total, covered, skipped: 0, pct };
}

function addMetric(target, source) {
	target.total += source.total;
	target.covered += source.covered;
	target.pct =
		target.total === 0 ? 100 : Number(((target.covered / target.total) * 100).toFixed(2));
}

function parseRecord(record) {
	const lines = record.split(/\r?\n/).filter(Boolean);
	const sourceFile = lines.find((line) => line.startsWith("SF:"))?.slice(3);

	if (!sourceFile) {
		return null;
	}

	const numberValue = (prefix) => {
		const line = lines.find((candidate) => candidate.startsWith(prefix));
		return line ? Number(line.slice(prefix.length)) : 0;
	};

	const lineMetric = metric(numberValue("LF:"), numberValue("LH:"));
	const functionMetric = metric(numberValue("FNF:"), numberValue("FNH:"));
	const branchMetric = metric(numberValue("BRF:"), numberValue("BRH:"));

	return {
		path: sourceFile,
		summary: {
			lines: lineMetric,
			statements: { ...lineMetric },
			functions: functionMetric,
			branches: branchMetric,
			branchesTrue: emptyMetric(),
		},
	};
}

function createCoverageSummary(lcov) {
	const total = {
		lines: emptyMetric(),
		statements: emptyMetric(),
		functions: emptyMetric(),
		branches: emptyMetric(),
		branchesTrue: emptyMetric(),
	};
	const summary = { total };

	for (const record of lcov.split("end_of_record")) {
		const parsed = parseRecord(record);

		if (!parsed) {
			continue;
		}

		summary[parsed.path] = parsed.summary;
		addMetric(total.lines, parsed.summary.lines);
		addMetric(total.statements, parsed.summary.statements);
		addMetric(total.functions, parsed.summary.functions);
		addMetric(total.branches, parsed.summary.branches);
	}

	return summary;
}

rmSync(coverageDirectory, { force: true, recursive: true });
mkdirSync(coverageDirectory, { recursive: true });

run("corepack", ["pnpm", "-r", "--if-present", "build"]);

const testFiles = findCompiledTestFiles();

if (testFiles.length === 0) {
	console.error("No compiled test files found. Run pnpm build before coverage.");
	process.exit(1);
}

run(process.execPath, [
	"--test",
	"--test-concurrency=1",
	"--experimental-test-coverage",
	"--test-reporter=spec",
	"--test-reporter-destination=stdout",
	"--test-reporter=lcov",
	`--test-reporter-destination=${relative(rootDirectory, lcovPath).split(sep).join("/")}`,
	...testFiles,
]);

const summary = createCoverageSummary(readFileSync(lcovPath, "utf8"));
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log(
	`Coverage summary: lines ${summary.total.lines.pct}% (${summary.total.lines.covered}/${summary.total.lines.total}), ` +
		`branches ${summary.total.branches.pct}% (${summary.total.branches.covered}/${summary.total.branches.total}), ` +
		`functions ${summary.total.functions.pct}% (${summary.total.functions.covered}/${summary.total.functions.total})`,
);
console.log(
	`Coverage artifacts: ${relative(rootDirectory, summaryPath)} and ${relative(rootDirectory, lcovPath)}`,
);
