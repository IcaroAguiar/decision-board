import { parseIsoDate } from "./calendar.js";
import type { SourceRef } from "./provenance.js";

export interface MethodRef {
	id: string;
	version: string;
}

export type AnalysisStatus = "complete" | "partial" | "inconclusive";
export type FindingSeverity = "info" | "warning" | "blocked";

export interface AnalysisFinding {
	code: string;
	severity: FindingSeverity;
	message: string;
	subject?: string;
}

export interface AnalysisResult<TInput, TOutput> {
	method: MethodRef;
	status: AnalysisStatus;
	asOf: string;
	inputs: TInput;
	assumptions: Record<string, string | number | boolean>;
	sources: SourceRef[];
	notVerified: string[];
	findings: AnalysisFinding[];
	output: TOutput | null;
}

export function createAnalysisResult<TInput, TOutput>(
	result: AnalysisResult<TInput, TOutput>,
): AnalysisResult<TInput, TOutput> {
	if (!result.method.id.trim() || !result.method.version.trim()) {
		throw new Error("Informe o identificador e a versão do método.");
	}
	parseIsoDate(result.asOf);
	if ((result.status === "inconclusive") !== (result.output === null)) {
		throw new Error("Somente uma análise inconclusiva deve ter saída nula.");
	}
	if (
		result.status !== "complete" &&
		!result.notVerified.some((entry) => entry.trim().length > 0) &&
		!result.findings.some((finding) => finding.message.trim().length > 0)
	) {
		throw new Error("Revisão necessária: explique por que a análise é parcial ou inconclusiva.");
	}
	const sources = new Map<string, SourceRef>();
	for (const source of result.sources) {
		parseIsoDate(source.asOf);
		if (!sources.has(source.id)) sources.set(source.id, source);
	}
	return { ...result, sources: [...sources.values()] };
}
