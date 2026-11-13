import { parseIsoDate } from "./calendar.js";
import { type DataNature, deduplicateSources, type SourceRef } from "./provenance.js";

export const methodIds = {
	fixedIncomeSimulation: "r1.fixed-income-simulation",
	rateRisk: "r2.rate-risk",
	correlationTest: "r3.correlation-test",
	allocationVsTarget: "r7.allocation-vs-target",
	goalTracking: "r8.goal-tracking",
} as const;
export type MethodId = (typeof methodIds)[keyof typeof methodIds];
const knownMethodIds: ReadonlySet<string> = new Set(Object.values(methodIds));

export interface MethodRef {
	id: MethodId;
	version: string;
}

export type AnalysisStatus = "complete" | "partial" | "inconclusive";
export function statusFromCoverage(coverage: "complete" | "partial" | "empty"): AnalysisStatus {
	return coverage === "empty" ? "inconclusive" : coverage;
}

export type FindingSeverity = "info" | "warning" | "blocked";

export interface AnalysisFinding {
	code: string;
	severity: FindingSeverity;
	message: string;
	subject?: string;
}

interface AnalysisCommon<TInput, TAssumptions> {
	method: MethodRef;
	strategyVersion: string | null;
	asOf: string;
	inputs: TInput;
	assumptions: TAssumptions;
	sources: SourceRef[];
	natures: DataNature[];
	notVerified: string[];
	findings: AnalysisFinding[];
}

export type AnalysisResult<
	TInput,
	TOutput,
	TAssumptions = Record<string, unknown>,
> = AnalysisCommon<TInput, TAssumptions> &
	({ status: "complete" | "partial"; output: TOutput } | { status: "inconclusive"; output: null });

export function createAnalysisResult<TInput, TOutput, TAssumptions = Record<string, unknown>>(
	result: AnalysisResult<TInput, TOutput, TAssumptions>,
): AnalysisResult<TInput, TOutput, TAssumptions> {
	if (!knownMethodIds.has(result.method.id) || !result.method.version.trim()) {
		throw new Error("Informe um identificador de método do catálogo e a versão do método.");
	}
	parseIsoDate(result.asOf);
	if ((result.status === "inconclusive") !== (result.output === null)) {
		throw new Error("Somente uma análise inconclusiva deve ter saída nula.");
	}
	if (
		result.status !== "complete" &&
		!result.notVerified.some((entry) => entry.trim().length > 0) &&
		!result.findings.some(
			(finding) =>
				(finding.severity === "warning" || finding.severity === "blocked") &&
				finding.message.trim().length > 0,
		)
	) {
		throw new Error("Revisão necessária: explique por que a análise é parcial ou inconclusiva.");
	}
	if (
		result.status === "complete" &&
		result.findings.some((finding) => finding.severity === "blocked")
	) {
		throw new Error("Uma análise com bloqueio não pode ser completa.");
	}
	return { ...result, sources: deduplicateSources(result.sources) };
}

export interface AnalysisRef {
	id: string;
	method: MethodRef;
	asOf: string;
	status: AnalysisStatus;
	strategyVersion: string | null;
}

export function toAnalysisRef<TInput, TOutput, TAssumptions>(
	id: string,
	result: AnalysisResult<TInput, TOutput, TAssumptions>,
): AnalysisRef {
	if (!id.trim()) throw new Error("Informe o identificador da análise.");
	return {
		id,
		method: result.method,
		asOf: result.asOf,
		status: result.status,
		strategyVersion: result.strategyVersion,
	};
}
