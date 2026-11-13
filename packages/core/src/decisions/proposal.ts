import {
	type AnalysisFinding,
	type AnalysisRef,
	type AnalysisResult,
	methodIds,
} from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
import type {
	CorrelationTestAssumptions,
	CorrelationTestInput,
	CorrelationTestOutput,
} from "../risk/index.js";
import { type PortfolioPart, portfolioParts } from "../units.js";
import { classifyAnalysesByStrategy, type StrategyVersion } from "./strategy.js";

export interface OperationPlanItem {
	assetId: string;
	ticker: string;
	part: PortfolioPart;
	assetClass: string;
	direction: "allocate" | "reduce";
	quantity: number;
	referencePrice: number;
}

export interface ProposalJustification {
	code: string;
	reason: string;
	subject: string | null;
}

export interface ProposalClaim {
	text: string;
	analysisId: string | null;
}

export type ProposalKind =
	| "contribution"
	| "rebalance"
	| "sale-review"
	| "hold"
	| "strategy-review";

export interface Proposal {
	id: string;
	kind: ProposalKind;
	items: readonly OperationPlanItem[];
	analyses: readonly AnalysisRef[];
	justifications: readonly ProposalJustification[];
	claims: readonly ProposalClaim[];
}

export interface EvaluatedClaim {
	text: string;
	verification: "verified" | "unverified-opinion";
}

export interface ProposalEvaluation {
	approvable: boolean;
	findings: AnalysisFinding[];
	notVerified: string[];
	claims: EvaluatedClaim[];
}

const knownPartSet = new Set<string>(portfolioParts);

export function correlationTestSubjects(
	result: AnalysisResult<CorrelationTestInput, CorrelationTestOutput, CorrelationTestAssumptions>,
): string[] {
	if (result.status === "inconclusive") {
		return [];
	}
	return result.output.candidates
		.filter((candidate) => candidate.longestCompleteWindow !== null)
		.map((candidate) => candidate.key);
}

export function evaluateProposal(proposal: Proposal, current: StrategyVersion): ProposalEvaluation {
	if (!proposal.id.trim()) {
		throw new Error("Informe o identificador da proposta.");
	}
	parseIsoDate(current.effectiveFrom);

	const seenItems = new Set<string>();
	for (const item of proposal.items) {
		if (!item.assetId.trim() || !item.ticker.trim() || !item.assetClass.trim()) {
			throw new Error("Preencha ativo, ticker e classe em todos os itens da proposta.");
		}
		if (!knownPartSet.has(item.part)) {
			throw new Error(`Parte da carteira inválida no item ${item.ticker}.`);
		}
		if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
			throw new Error(`A quantidade de ${item.ticker} deve ser um inteiro positivo.`);
		}
		if (!Number.isFinite(item.referencePrice) || item.referencePrice <= 0) {
			throw new Error(`O preço de referência de ${item.ticker} deve ser positivo e finito.`);
		}
		const itemKey = `${item.assetId}\0${item.direction}`;
		if (seenItems.has(itemKey)) {
			throw new Error("Item duplicado para o mesmo ativo e direção.");
		}
		seenItems.add(itemKey);
	}

	const analysesById = new Map<string, AnalysisRef>();
	for (const ref of proposal.analyses) {
		if (!ref.id.trim()) {
			throw new Error("Informe o identificador da análise referenciada.");
		}
		parseIsoDate(ref.asOf);
		if (analysesById.has(ref.id)) {
			throw new Error(`Referência de análise duplicada na proposta: ${ref.id}.`);
		}
		analysesById.set(ref.id, ref);
	}

	const findings: AnalysisFinding[] = [];
	for (const item of proposal.items) {
		if (item.part !== "variableIncome" || item.direction !== "allocate") {
			continue;
		}
		const hasCorrelationTest = proposal.analyses.some(
			(ref) =>
				ref.method.id === methodIds.correlationTest &&
				(ref.status === "complete" || ref.status === "partial") &&
				ref.subjects.includes(item.assetId),
		);
		const hasWaiver = proposal.justifications.some(
			(justification) =>
				justification.code === "r3-waived" &&
				justification.reason.trim().length > 0 &&
				justification.subject === item.assetId,
		);
		if (!hasCorrelationTest && !hasWaiver) {
			findings.push({
				code: "missing_r3_correlation_test",
				severity: "blocked",
				subject: item.assetId,
				message: `Revisão necessária: alocação em renda variável (${item.ticker}) sem teste de correlação (R3) para o ativo.`,
			});
		}
	}

	for (const entry of classifyAnalysesByStrategy(proposal.analyses, current)) {
		if (entry.ref.status === "inconclusive") {
			findings.push({
				code: "inconclusive_analysis",
				severity: "warning",
				subject: entry.ref.id,
				message: `Análise ${entry.ref.id} (${entry.ref.method.id}) inconclusiva; revisão necessária.`,
			});
		}
		if (entry.classification === "previous") {
			findings.push({
				code: "previous_strategy_version",
				severity: "warning",
				subject: entry.ref.id,
				message: "Análise feita sob versão anterior da estratégia; revisão necessária.",
			});
		}
	}

	const claims: EvaluatedClaim[] = [];
	for (const claim of proposal.claims) {
		if (!claim.text.trim()) {
			throw new Error("Informe o texto da afirmação.");
		}
		const referencedAnalysis =
			claim.analysisId === null ? undefined : analysesById.get(claim.analysisId);
		if (
			referencedAnalysis !== undefined &&
			(referencedAnalysis.status === "complete" || referencedAnalysis.status === "partial")
		) {
			claims.push({ text: claim.text, verification: "verified" });
		} else {
			claims.push({ text: claim.text, verification: "unverified-opinion" });
			findings.push({
				code: "unverified_claim",
				severity: "warning",
				message:
					referencedAnalysis?.status === "inconclusive"
						? `Opinião não verificada: análise ${referencedAnalysis.id} inconclusiva (${claim.text}).`
						: `Opinião não verificada: afirmação sem referência a análise calculada (${claim.text}).`,
			});
		}
	}

	const notVerified = [
		"Execução fora do produto: a próxima importação da B3 confere o que foi feito.",
	];
	if (proposal.items.some((item) => item.direction === "reduce")) {
		notVerified.push("Venda não simulada nesta versão do motor.");
	}

	return {
		approvable: !findings.some((finding) => finding.severity === "blocked"),
		findings,
		notVerified,
		claims,
	};
}
