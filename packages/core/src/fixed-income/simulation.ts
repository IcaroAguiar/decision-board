import { createAnalysisResult, methodIds } from "../analysis.js";
import { type BusinessCalendar, calendarDaysBetween } from "../calendar.js";
import { collectEvidence, type Datum } from "../provenance.js";
import type { AccrualRate, RateScenario } from "./rates.js";
import { breakEvenCdi, type SolverOptions, turningPoint } from "./solvers.js";
import { type CustodyFee, redemptionValue, type TaxTable } from "./taxation.js";

export interface FixedIncomeCandidate {
	id: string;
	maturity: string;
	rate: AccrualRate;
	taxExempt: boolean;
	custody: Datum<CustodyFee>;
}
export interface FixedIncomeInput {
	asOf: string;
	strategyVersion: string | null;
	from: string;
	redemptionDate: string;
	principal: Datum<number>;
	candidates: readonly Datum<FixedIncomeCandidate>[];
	scenarios: readonly Datum<RateScenario>[];
	taxTable: Datum<TaxTable>;
	comparisons?: readonly {
		candidateId: string;
		product: "cdb" | "lci";
		custody: Datum<CustodyFee>;
	}[];
	turningPoints?: readonly {
		candidateId: string;
		custody: Datum<CustodyFee>;
		taxExempt: boolean;
	}[];
	solver?: SolverOptions;
}
export interface SimulationRow {
	candidateId: string;
	scenarioId: string;
	value: ReturnType<typeof redemptionValue>;
	breakEvens: { product: "cdb" | "lci"; multiplier: number }[];
	turningPoint: number | null;
}
const r1NotVerified = [
	"taxa de custódia própria da instituição, quando não informada",
	"mudança de regra tributária depois da data da análise",
	"preço de venda antecipada fica a cargo do R2",
];

export function simulateFixedIncome(input: FixedIncomeInput, calendar: BusinessCalendar) {
	const evidence = collectEvidence([
		input.principal,
		input.taxTable,
		...input.candidates,
		...input.scenarios,
		...input.candidates.flatMap((candidate) =>
			candidate.status === "known" ? [candidate.value.custody] : [],
		),
		...(input.comparisons ?? []).map((comparison) => comparison.custody),
		...(input.turningPoints ?? []).map((point) => point.custody),
	]);
	const common = {
		method: { id: methodIds.fixedIncomeSimulation, version: "1.0.0" },
		strategyVersion: input.strategyVersion,
		asOf: input.asOf,
		inputs: input,
		assumptions: {
			paths: input.scenarios,
			taxTable: input.taxTable,
			custody: input.candidates.map((candidate) =>
				candidate.status === "known" ? candidate.value.custody : candidate,
			),
			accrual:
				"252 DU; [início,fim); IR sobre ganho positivo; custódia simples sobre excedente diário inicial",
			solverTolerance: input.solver?.tolerance ?? 1e-10,
		},
		sources: evidence.sources,
		notVerified: [...r1NotVerified, ...evidence.notVerified],
		findings: [
			{
				code: "SCENARIO_SIMULATION",
				severity: "info",
				message: "Simulação na curva por cenário; revisão necessária das premissas.",
			},
		] satisfies import("../analysis.js").AnalysisFinding[],
	};
	const rows: SimulationRow[] = [];
	// Valida a cobertura mesmo quando faltam outros dados; nunca extrapola feriados.
	calendar.businessDaysBetween(input.from, input.redemptionDate);
	if (input.principal.status === "known" && input.taxTable.status === "known") {
		for (const candidateDatum of input.candidates) {
			if (candidateDatum.status === "missing") continue;
			const candidate = candidateDatum.value;
			calendarDaysBetween(input.from, candidate.maturity);
			if (input.redemptionDate > candidate.maturity)
				throw new Error("O resgate não pode ultrapassar o vencimento do candidato.");
			if (candidate.custody.status === "missing") continue;
			for (const scenario of input.scenarios) {
				if (scenario.status === "missing") continue;
				const investment = {
					principal: input.principal.value,
					from: input.from,
					to: input.redemptionDate,
					asOf: input.asOf,
					calendar,
					scenario: scenario.value,
					taxTable: input.taxTable.value,
					custody: candidate.custody.value,
				};
				const prefixed = { ...investment, rate: candidate.rate, taxExempt: candidate.taxExempt };
				const value = redemptionValue(prefixed);
				const breakEvens: SimulationRow["breakEvens"] = [];
				for (const comparison of input.comparisons ?? []) {
					if (comparison.candidateId !== candidate.id || comparison.custody.status === "missing")
						continue;
					breakEvens.push({
						product: comparison.product,
						multiplier: breakEvenCdi({
							targetNet: value.net,
							product: comparison.product,
							investment: { ...investment, custody: comparison.custody.value },
							solver: input.solver,
						}),
					});
				}
				let point: number | null = null;
				for (const request of input.turningPoints ?? []) {
					if (request.candidateId !== candidate.id || request.custody.status === "missing")
						continue;
					point = turningPoint({
						prefixed,
						postfixed: {
							...investment,
							custody: request.custody.value,
							taxExempt: request.taxExempt,
						},
						solver: input.solver,
					});
				}
				rows.push({
					candidateId: candidate.id,
					scenarioId: scenario.value.id,
					value,
					breakEvens,
					turningPoint: point,
				});
			}
		}
	}
	if (rows.length === 0) {
		return createAnalysisResult<FixedIncomeInput, SimulationRow[], typeof common.assumptions>({
			...common,
			status: "inconclusive",
			output: null,
			findings: [
				...common.findings,
				{
					code: "MISSING_INPUT",
					severity: "blocked",
					message: "Dados insuficientes para calcular a simulação.",
				},
			],
		});
	}
	return createAnalysisResult<FixedIncomeInput, SimulationRow[], typeof common.assumptions>({
		...common,
		status: evidence.hasMissing ? "partial" : "complete",
		output: rows,
	});
}
