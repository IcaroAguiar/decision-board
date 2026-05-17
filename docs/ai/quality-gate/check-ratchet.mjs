#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const gateDir = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(gateDir, "baseline.json"), "utf8"));
const config = JSON.parse(readFileSync(join(gateDir, "quality-gate.config.json"), "utf8"));
const failures = [];
const warnings = [];
const improvements = [];
const sourceExtensions = new Set([".astro",".c",".cc",".cpp",".cs",".css",".go",".java",".js",".jsx",".kt",".mjs",".php",".py",".rb",".rs",".scss",".sql",".swift",".ts",".tsx",".vue"]);
const ignoredDirs = new Set([".cache",".git",".next",".turbo",".venv","build","coverage","dist","node_modules","target","vendor"]);

function readJson(path) { try { return JSON.parse(readFileSync(join(root, path), "utf8")); } catch { return null; } }
function run(args) { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return ""; } }
function fail(id, message) { failures.push({ id, message }); }
function warn(id, message) { warnings.push({ id, message }); }
function pct(value) { return value === null || value === undefined ? "n/a" : String(value) + "%"; }
function delta(current, previous) { return current === null || current === undefined || previous === null || previous === undefined ? null : Number((current - previous).toFixed(2)); }
function statusIcon(ok) { return ok ? "PASS" : "FAIL"; }
function pathPatternToRegex(pattern) {
  const normalized = String(pattern || "").replace(/^\.\//, "");
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*");
  return new RegExp(`(^|/)${escaped}($|/)`);
}

const ignoredPathPatterns = (config.ignorePaths || []).map(pathPatternToRegex);
function isIgnoredPath(path) {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return ignoredPathPatterns.some((pattern) => pattern.test(normalized));
}

function changedFiles() {
  const base = process.env.AGENTIC_REVIEW_BASE || config.base || "origin/main";
  const files = new Set();
  for (const command of [
    ["diff", "--name-only", base + "...HEAD"],
    ["diff", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const output = run(command);
    for (const file of output ? output.split(/\r?\n/).filter(Boolean) : []) {
      files.add(file);
    }
  }
  return [...files].filter((file) => !isIgnoredPath(file));
}

function lineCount(path) { try { return readFileSync(join(root, path), "utf8").split(/\r?\n/).length; } catch { return 0; } }
function commentDensity(path) {
  let text = "";
  try { text = readFileSync(join(root, path), "utf8"); } catch { return 0; }
  const lines = text.split(/\r?\n/);
  const commentLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("--") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("<!--");
  }).length;
  return lines.length ? Number((commentLines / lines.length).toFixed(4)) : 0;
}

function walk(current = root, files = []) {
  for (const entry of execFileSync("find", [relative(root, current) || ".", "-maxdepth", "1", "-mindepth", "1", "-print"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean)) {
    const abs = join(root, entry);
    if (ignoredDirs.has(basename(abs))) continue;
    const type = execFileSync("stat", ["-f", "%HT", abs], { encoding: "utf8" }).trim();
    if (type === "Directory") walk(abs, files);
    else files.push(abs);
  }
  return files;
}

function sourceFiles() {
  const tracked = run(["ls-files"]);
  const files = tracked ? tracked.split(/\r?\n/).map((path) => join(root, path)) : walk();
  return files.filter((path) => {
    const rel = relative(root, path);
    return sourceExtensions.has(extname(path)) && !path.includes("/node_modules/") && !isIgnoredPath(rel);
  });
}

function collectCodeMetrics() {
  const byFile = [];
  let totalLines = 0;
  let commentLines = 0;
  for (const abs of sourceFiles()) {
    let text = "";
    try { text = readFileSync(abs, "utf8"); } catch { continue; }
    const rel = relative(root, abs);
    const lines = text.split(/\r?\n/).length;
    const density = commentDensity(rel);
    const comments = Math.round(lines * density);
    totalLines += lines;
    commentLines += comments;
    byFile.push({ path: rel, lines, commentLines: comments, commentDensity: density });
  }
  byFile.sort((a, b) => b.lines - a.lines);
  return { sourceFiles: byFile.length, totalLines, commentLines, commentDensity: totalLines ? Number((commentLines / totalLines).toFixed(4)) : null, largeFiles: byFile.filter((file) => file.lines > config.thresholds.maxNewFileLines).length, largestFiles: byFile.slice(0, 50) };
}

function coverageMetric() {
  const json = readJson(config.reportPaths.coverageSummary);
  return json?.total?.lines?.pct === undefined ? null : Number(json.total.lines.pct);
}
function duplicationMetric() {
  const json = readJson(config.reportPaths.jscpd);
  const stats = json?.statistics || json?.statistic || json;
  const total = stats?.total || stats;
  const value = total?.percentage ?? total?.duplicatedLinesPercentage ?? total?.duplicatedPercentage;
  return value === undefined ? null : Number(value);
}
function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableJson(item)]));
  }
  return value;
}
function fingerprintReviewSignals(repos, files) {
  const payload = {
    changedFiles: [...files].sort(),
    repositories: repos.map((repo) => ({
      name: repo.name,
      normalizedGateSummary: repo.normalizedGateSummary || {},
      findingsSummary: repo.findingsSummary || {},
      findings: (Array.isArray(repo.findings) ? repo.findings : []).map((finding) => ({
        rule: finding.rule,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        text: finding.text,
        domain: finding.domain,
        importance: finding.importance,
        count: finding.count,
        lines: finding.lines || [],
      })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    })).sort((left, right) => String(left.name).localeCompare(String(right.name))),
  };
  return createHash("sha256").update(JSON.stringify(stableJson(payload))).digest("hex");
}
function normalizeBaseName(base) {
  return String(base || "").replace(/^refs\/heads\//, "").replace(/^origin\//, "");
}
function agenticReviewMetric(files) {
  const packet = readJson(config.reportPaths.agenticReviewPacket);
  if (!packet) return null;
  const repos = Array.isArray(packet.repositories) ? packet.repositories : [];
  let deterministicBlocking = 0, highSignals = 0, mediumSignals = 0;
  for (const repo of repos) {
    deterministicBlocking += Number(repo.normalizedGateSummary?.blocking || 0);
    highSignals += Number(repo.findingsSummary?.high || 0);
    mediumSignals += Number(repo.findingsSummary?.medium || 0);
  }
  let blocking = 0, high = 0, medium = 0;
  if (packet.findings) {
    high += packet.findings.filter((finding) => finding.severity === "high").length;
    medium += packet.findings.filter((finding) => finding.severity === "medium").length;
    blocking += packet.findings.filter((finding) => ["high", "medium"].includes(finding.severity)).length;
  }
  return { blocking, high, medium, deterministicBlocking, highSignals, mediumSignals, fingerprint: fingerprintReviewSignals(repos, files) };
}
function agenticReviewAttestationMetric(review) {
  const path = config.reportPaths.agenticReviewAttestation || "docs/ai/quality-gate/agentic-review-attestation.json";
  const required = Boolean(review && (review.deterministicBlocking > 0 || review.highSignals > 0));
  if (!required) return { required, valid: true, path, status: "not-required" };
  const attestation = readJson(path);
  if (!attestation) return { required, valid: false, path, status: "missing", errors: ["missing attestation"] };
  const errors = [];
  const verdict = String(attestation.verdict || "").toLowerCase().replace(/\s+/g, "_");
  const acceptedVerdicts = new Set(["approved", "approved_with_risk", "pode_aprovar", "pode_aprovar_com_ressalvas"]);
  if (!acceptedVerdicts.has(verdict)) errors.push("verdict must approve the reviewed deterministic signals");
  if (attestation.deterministicSignalsReviewed !== true) errors.push("deterministicSignalsReviewed must be true");
  if (!attestation.reviewer) errors.push("reviewer is required");
  if (Number.isNaN(Date.parse(String(attestation.reviewedAt || "")))) errors.push("reviewedAt must be an ISO timestamp");
  if (attestation.reviewedFingerprint !== review.fingerprint) errors.push("reviewedFingerprint does not match current deterministic review packet");
  const reviewedSignals = attestation.reviewedDeterministicSignals || {};
  if (Number(reviewedSignals.blocking) !== review.deterministicBlocking) errors.push("reviewed blocking signal count does not match current packet");
  if (Number(reviewedSignals.high) !== review.highSignals) errors.push("reviewed high signal count does not match current packet");
  if (Number(reviewedSignals.medium) !== review.mediumSignals) errors.push("reviewed medium signal count does not match current packet");
  const currentBase = normalizeBaseName(process.env.AGENTIC_REVIEW_BASE || config.base || "origin/main");
  const allowedBases = Array.isArray(attestation.allowedBases) ? attestation.allowedBases.map(normalizeBaseName) : [];
  if (allowedBases.length > 0 && !allowedBases.includes(currentBase)) errors.push("current review base is not covered by attestation");
  return { required, valid: errors.length === 0, path, status: errors.length === 0 ? "valid" : "invalid", errors, reviewer: attestation.reviewer || null, verdict, reviewedAt: attestation.reviewedAt || null };
}
function feedbackMetric() {
  const feedback = readJson(config.reportPaths.feedback);
  const entries = Array.isArray(feedback?.feedback) ? feedback.feedback : [];
  const falsePositive = entries.filter((entry) => entry.outcome === "false-positive").length;
  const falseNegative = entries.filter((entry) => entry.outcome === "false-negative").length;
  for (const entry of entries.filter((entry) => entry.outcome === "false-negative")) {
    improvements.push({ type: "false-negative", rule: entry.rule || "unknown", recommendation: entry.recommendation || "Add or tune a detector/test so this escaped issue is caught before merge.", source: entry.case || entry.source || "review-feedback" });
  }
  return { total: entries.length, falsePositive, falseNegative };
}

const files = changedFiles();
const code = collectCodeMetrics();
const coverage = coverageMetric();
const duplication = duplicationMetric();
const review = agenticReviewMetric(files);
const reviewAttestation = agenticReviewAttestationMetric(review);
const feedback = feedbackMetric();
const baselineCoverage = baseline.metrics.coverage?.linesPct;
const baselineDuplication = baseline.metrics.duplication?.duplicatedLinesPct;

if (config.requiredChecks.coverage && coverage === null) fail("coverage.missing", "Coverage is required but " + config.reportPaths.coverageSummary + " was not found.");
else if (coverage !== null) {
  if (coverage < config.thresholds.newCoverageMin) fail("coverage.minimum", "Coverage " + coverage + "% is below minimum " + config.thresholds.newCoverageMin + "%.");
  if (baselineCoverage !== undefined && coverage + config.thresholds.coverageDropMax < baselineCoverage) fail("coverage.ratchet", "Coverage dropped from " + baselineCoverage + "% to " + coverage + "%.");
}
if (config.requiredChecks.duplication && duplication === null) warn("duplication.missing", "Duplication report " + config.reportPaths.jscpd + " was not found; install/run jscpd to enforce this gate.");
else if (duplication !== null) {
  if (duplication > config.thresholds.newDuplicationMax) fail("duplication.maximum", "Duplication " + duplication + "% exceeds " + config.thresholds.newDuplicationMax + "%.");
  if (baselineDuplication !== undefined && duplication > baselineDuplication + config.thresholds.duplicationIncreaseMax) fail("duplication.ratchet", "Duplication increased from " + baselineDuplication + "% to " + duplication + "%.");
}
if (code.largeFiles > baseline.metrics.code.largeFiles + config.thresholds.maxLargeFileCountIncrease) fail("code.large-file-ratchet", "Large file count increased from " + baseline.metrics.code.largeFiles + " to " + code.largeFiles + ".");

const baselineFileByPath = new Map((baseline.metrics.code.largestFiles || []).map((file) => [file.path, file]));
for (const file of files) {
  if (!sourceExtensions.has(extname(file))) continue;
  const lines = lineCount(file);
  const density = commentDensity(file);
  const baselineFile = baselineFileByPath.get(file);
  if (lines > config.thresholds.maxNewFileLines) fail("file.size", "Changed file " + file + " has " + lines + " lines; limit is " + config.thresholds.maxNewFileLines + ". Split it or justify in review.");
  if (lines > config.thresholds.maxNewFileLines && density < config.thresholds.minCommentDensityForLargeFiles) warn("file.context-comments", "Large changed file " + file + " has low context-comment density. Add useful why/invariant comments or split responsibility.");
  if (config.policies.touchedBadAreaMustImprove && baselineFile && baselineFile.lines > config.thresholds.maxNewFileLines && lines > baselineFile.lines + config.thresholds.touchedLargeFileMaxLineIncrease) {
    fail("touched-bad-area.must-improve", "Touched large file " + file + " grew from " + baselineFile.lines + " to " + lines + " lines. Improve/split it or add an explicit quality-gate exception.");
  }
}
if (config.requiredChecks.agenticReviewPacket && review === null) fail("agentic-review.missing", "Agentic review packet " + config.reportPaths.agenticReviewPacket + " was not found.");
else if (review) {
  if (review.high > config.thresholds.maxHighReviewFindings) fail("agentic-review.high", "Agentic review has " + review.high + " high findings.");
  if (review.blocking > config.thresholds.maxBlockingReviewFindings) fail("agentic-review.blocking", "Agentic review has " + review.blocking + " blocking findings.");
  if (review.deterministicBlocking > 0 || review.highSignals > 0) warn("agentic-review.deterministic-signals", "Deterministic review packet has " + review.deterministicBlocking + " blocking signal(s) and " + review.highSignals + " high signal(s); reviewer interpretation is required before merge-ready claims.");
  if (reviewAttestation.required && !reviewAttestation.valid) fail("agentic-review.attestation", "Deterministic review signals require a valid independent review attestation at " + reviewAttestation.path + ": " + (reviewAttestation.errors || []).join("; "));
}

const rows = [
  { metric: "Coverage", baseline: pct(baselineCoverage), current: pct(coverage), target: pct(config.thresholds.newCoverageMin), delta: delta(coverage, baselineCoverage), status: !failures.some((f) => f.id.startsWith("coverage.")) },
  { metric: "Duplication", baseline: pct(baselineDuplication), current: pct(duplication), target: "<= " + pct(config.thresholds.newDuplicationMax), delta: delta(duplication, baselineDuplication), status: !failures.some((f) => f.id.startsWith("duplication.")) },
  { metric: "Large files", baseline: baseline.metrics.code.largeFiles, current: code.largeFiles, target: "no increase", delta: code.largeFiles - baseline.metrics.code.largeFiles, status: !failures.some((f) => f.id.startsWith("code.") || f.id.startsWith("file.") || f.id.startsWith("touched-bad-area")) },
  { metric: "Agentic review blocking", baseline: 0, current: review?.blocking ?? "n/a", target: 0, delta: review?.blocking ?? null, status: !failures.some((f) => f.id.startsWith("agentic-review.")) },
  { metric: "Deterministic review signals", baseline: "reviewed", current: review?.deterministicBlocking ?? "n/a", target: "valid attestation", delta: review?.deterministicBlocking ?? null, status: review !== null && reviewAttestation.valid },
  { metric: "Feedback false negatives", baseline: "tracked", current: feedback.falseNegative, target: 0, delta: feedback.falseNegative, status: feedback.falseNegative === 0 },
];
const markdown = [
  "# Agentic Quality Gate",
  "",
  "Status: **" + (failures.length ? "FAIL" : "PASS") + "**",
  "",
  "| Metric | Baseline | Current | Target | Delta | Status |",
  "| --- | ---: | ---: | ---: | ---: | --- |",
  ...rows.map((row) => "| " + row.metric + " | " + row.baseline + " | " + row.current + " | " + row.target + " | " + (row.delta ?? "n/a") + " | " + statusIcon(row.status) + " |"),
  "",
  "## Failures",
  failures.length ? failures.map((item) => "- **" + item.id + "**: " + item.message).join("\n") : "- None",
  "",
  "## Warnings",
  warnings.length ? warnings.map((item) => "- **" + item.id + "**: " + item.message).join("\n") : "- None",
  "",
  "## Auto-Improve Queue",
  improvements.length ? improvements.map((item) => "- **" + item.type + " / " + item.rule + "**: " + item.recommendation + " (source: " + item.source + ")").join("\n") : "- None",
  "",
].join("\n");
const report = { status: failures.length ? "fail" : "pass", generatedAt: new Date().toISOString(), failures, warnings, improvements, metrics: { coverage, duplication, code, review, reviewAttestation, feedback, rows }, changedFiles: files };
mkdirSync(gateDir, { recursive: true });
writeFileSync(join(gateDir, "quality-gate-report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(gateDir, "quality-gate-report.md"), markdown + "\n");
writeFileSync(join(gateDir, "quality-trend-entry.json"), JSON.stringify({ generatedAt: report.generatedAt, status: report.status, coverage, duplication, largeFiles: code.largeFiles, review, feedback }, null, 2) + "\n");
writeFileSync(join(gateDir, "auto-improvement-queue.json"), JSON.stringify({ generatedAt: report.generatedAt, improvements, feedback }, null, 2) + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
