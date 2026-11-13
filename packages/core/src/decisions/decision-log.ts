import type { AnalysisStatus, MethodId } from "../analysis.js";
import { parseIsoDate } from "../calendar.js";
import { evaluateProposal, type OperationPlanItem, type Proposal } from "./proposal.js";
import { type StrategyVersion, versionLabel } from "./strategy.js";

export type DecisionOutcome = "approved" | "adjusted" | "postponed" | "rejected";

export type Actor =
	| { kind: "person"; confirmedInSession: boolean }
	| { kind: "scheduled-routine" }
	| { kind: "ai-assistant" };

export interface RecordedAnalysisSummary {
	id: string;
	methodId: MethodId;
	methodVersion: string;
	status: AnalysisStatus;
}

export interface OperationPlan {
	proposalId: string;
	items: OperationPlanItem[];
	status: "awaiting-execution";
	note: "Executado pela pessoa fora do Decision Board; conferido na próxima importação da B3.";
}

export interface DecisionRecord {
	proposalId: string;
	outcome: DecisionOutcome;
	reason: string;
	decidedAt: string;
	strategyVersion: string;
	analyses: RecordedAnalysisSummary[];
	operationPlan: OperationPlan | null;
}

export interface RecordDecisionInput {
	proposal: Proposal;
	outcome: DecisionOutcome;
	reason: string;
	decidedAt: string;
	strategy: StrategyVersion;
	actor: Actor;
}

export function authorizeMovementRecording(
	actor: Actor,
): { allowed: true } | { allowed: false; reason: string } {
	if (actor.kind === "scheduled-routine") {
		return {
			allowed: false,
			reason:
				"Rotinas agendadas apenas verificam, calculam e alertam; não podem registrar movimentação.",
		};
	}
	if (actor.kind === "ai-assistant") {
		return {
			allowed: false,
			reason: "A IA não pode registrar movimentação sem confirmação explícita da pessoa.",
		};
	}
	if (!actor.confirmedInSession) {
		return {
			allowed: false,
			reason:
				"Confirmação explícita da pessoa nesta sessão é necessária para registrar movimentação.",
		};
	}
	return { allowed: true };
}

export function recordDecision({
	proposal,
	outcome,
	reason,
	decidedAt,
	strategy,
	actor,
}: RecordDecisionInput): DecisionRecord {
	if (actor.kind !== "person" || !actor.confirmedInSession) {
		throw new Error(
			"Somente uma pessoa com confirmação explícita nesta sessão pode registrar decisão.",
		);
	}
	parseIsoDate(decidedAt);
	if (!reason.trim()) {
		throw new Error("Informe o motivo da decisão.");
	}
	const evaluation = evaluateProposal(proposal, strategy);
	if (proposal.analyses.length === 0) {
		throw new Error("Toda decisão registrada precisa referenciar ao menos uma análise.");
	}
	const isApprovalOutcome = outcome === "approved" || outcome === "adjusted";
	if (isApprovalOutcome && !evaluation.approvable) {
		throw new Error("Proposta bloqueada não pode ser aprovada ou ajustada; revisão necessária.");
	}
	return {
		proposalId: proposal.id,
		outcome,
		reason: reason.trim(),
		decidedAt,
		strategyVersion: versionLabel(strategy),
		analyses: proposal.analyses.map((ref) => ({
			id: ref.id,
			methodId: ref.method.id,
			methodVersion: ref.method.version,
			status: ref.status,
		})),
		operationPlan: isApprovalOutcome
			? {
					proposalId: proposal.id,
					items: proposal.items.map((item) => ({ ...item })),
					status: "awaiting-execution",
					note: "Executado pela pessoa fora do Decision Board; conferido na próxima importação da B3.",
				}
			: null,
	};
}
