#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const gateDir = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(gateDir, "baseline.json");
const reportPath = join(gateDir, "quality-gate-report.json");
const trendPath = join(gateDir, "quality-trend.jsonl");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const report = JSON.parse(readFileSync(reportPath, "utf8"));
if (report.status !== "pass") {
  console.error("Refusing to refresh baseline from a failing quality gate report.");
  process.exit(1);
}
baseline.generatedAt = new Date().toISOString();
baseline.metrics.coverage = report.metrics.coverage === null || report.metrics.coverage === undefined ? baseline.metrics.coverage : { ...(baseline.metrics.coverage || { path: "coverage/coverage-summary.json" }), linesPct: report.metrics.coverage };
baseline.metrics.duplication = report.metrics.duplication === null || report.metrics.duplication === undefined ? baseline.metrics.duplication : { ...(baseline.metrics.duplication || { path: "report/jscpd-report.json" }), duplicatedLinesPct: report.metrics.duplication };
baseline.metrics.code = report.metrics.code || baseline.metrics.code;
baseline.metrics.review = { blockingFindings: report.metrics.review?.blocking || 0, highFindings: report.metrics.review?.high || 0, mediumFindings: report.metrics.review?.medium || 0 };
writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
appendFileSync(trendPath, JSON.stringify({ refreshedAt: baseline.generatedAt, status: report.status, metrics: report.metrics }) + "\n");
console.log("Baseline refreshed from passing quality gate report.");
