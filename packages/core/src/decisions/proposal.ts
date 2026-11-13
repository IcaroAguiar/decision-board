import { type AnalysisFinding, type AnalysisRef, methodIds } from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
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

	const analysisIds = new Set<string>();
	for (const ref of proposal.analyses) {
		if (!ref.id.trim()) {
			throw new Error("Informe o identificador da análise referenciada.");
		}
		parseIsoDate(ref.asOf);
		if (analysisIds.has(ref.id)) {
			throw new Error(`Referência de análise duplicada na proposta: ${ref.id}.`);
		}
		analysisIds.add(ref.id);
	}

	const findings: AnalysisFinding[] = [];
	const allocatesVariableIncome = proposal.items.some(
		(item) => item.part === "variableIncome" && item.direction === "allocate",
	);
	if (allocatesVariableIncome) {
		const hasCorrelationTest = proposal.analyses.some(
			(ref) =>
				ref.method.id === methodIds.correlationTest &&
				(ref.status === "complete" || ref.status === "partial"),
		);
		const hasWaiver = proposal.justifications.some(
			(justification) =>
				justification.code === "r3-waived" && justification.reason.trim().length > 0,
		);
		if (!hasCorrelationTest && !hasWaiver) {
			findings.push({
				code: "missing_r3_correlation_test",
				severity: "blocked",
				message: "Revisão necessária: proposta de renda variável sem teste de correlação (R3).",
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
		if (claim.analysisId !== null && analysisIds.has(claim.analysisId)) {
			claims.push({ text: claim.text, verification: "verified" });
		} else {
			claims.push({ text: claim.text, verification: "unverified-opinion" });
			findings.push({
				code: "unverified_claim",
				severity: "warning",
				message: `Opinião não verificada: afirmação sem referência a análise calculada (${claim.text}).`,
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
