import { type AnalysisFinding, createAnalysisResult, methodIds } from "../analysis.js";
import { collectEvidence } from "../provenance.js";
import {
	addMonths,
	alignSeries,
	type MonthlySeries,
	monthsBetween,
	parseYearMonth,
	type YearMonth,
} from "../series.js";
import { approxEqual } from "../units.js";

export interface GoalTrackingInput {
	targetValue: number;
	targetMonth: YearMonth;
	frozenProjection: { plannedContributions: MonthlySeries; projectedValues: MonthlySeries };
	realizedContributions: MonthlySeries;
	realizedValues: MonthlySeries;
	alertThreshold?: number;
	asOf: YearMonth;
	strategyVersion: string;
}
export type GoalDeviationCause = "aporte" | "rendimento" | "dinheiro parado";
export interface GoalTrackingMonth {
	month: YearMonth;
	projectedValue: number | null;
	realizedValue: number | null;
	plannedContribution: number | null;
	realizedContribution: number | null;
	projectedGain: number | null;
	realizedGain: number | null;
	causes: GoalDeviationCause[];
}

/** Valores de fechamento do mês; o primeiro fechamento é a base, não um ganho sobre zero. */
export function analyzeGoalTracking(input: GoalTrackingInput) {
	parseYearMonth(input.asOf);
	parseYearMonth(input.targetMonth);
	if (!Number.isFinite(input.targetValue) || input.targetValue <= 0)
		throw new Error("Informe um valor alvo positivo e finito.");
	const threshold = input.alertThreshold ?? 0.15;
	if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
		throw new Error("Limite de alerta inválido.");
	const series = [
		input.frozenProjection.plannedContributions,
		input.frozenProjection.projectedValues,
		input.realizedContributions,
		input.realizedValues,
	];
	// Valida inclusive as partes futuras da projeção recebida, sem alterá-la.
	alignSeries(series);
	for (const points of series)
		for (const point of points)
			if (point.value.status === "known" && point.value.value < 0)
				throw new Error("Valores e aportes não podem ser negativos.");
	const start = input.frozenProjection.projectedValues[0]?.month;
	if (start === undefined || start > input.asOf)
		throw new Error("A projeção precisa de um fechamento inicial até o mês de referência.");
	if (input.targetMonth < start)
		throw new Error("A Meta não pode terminar antes do início do plano.");
	const window = { end: input.asOf, months: monthsBetween(start, input.asOf) + 1 };
	const aligned = alignSeries(series, window);
	const evidence = collectEvidence(
		series.flatMap((points) =>
			points.filter((p) => p.month >= start && p.month <= input.asOf).map((p) => p.value),
		),
	);
	const notVerified = [
		...evidence.notVerified,
		"A projeção congelada é um cenário condicionado às premissas do plano.",
	];
	for (const month of aligned.missingMonths)
		notVerified.push(`Mês sem cobertura completa: ${month}`);
	const maps = series.map((points) => new Map(points.map((p) => [p.month, p.value])));
	const valueAt = (index: number, month: YearMonth) => {
		const datum = maps[index]?.get(month);
		return datum?.status === "known" ? datum.value : null;
	};
	const rows: GoalTrackingMonth[] = [];
	const findings: AnalysisFinding[] = [];
	for (let i = 0; i < window.months; i++) {
		const month = addMonths(start, i);
		const plannedContribution = valueAt(0, month);
		const projectedValue = valueAt(1, month);
		const realizedContribution = valueAt(2, month);
		const realizedValue = valueAt(3, month);
		const previous = i > 0 ? addMonths(month, -1) : null;
		const previousProjected = previous === null ? null : valueAt(1, previous);
		const previousRealized = previous === null ? null : valueAt(3, previous);
		const projectedGain =
			projectedValue !== null && previousProjected !== null && plannedContribution !== null
				? projectedValue - previousProjected - plannedContribution
				: null;
		const realizedGain =
			realizedValue !== null && previousRealized !== null && realizedContribution !== null
				? realizedValue - previousRealized - realizedContribution
				: null;
		const causes: GoalDeviationCause[] = [];
		if (
			plannedContribution !== null &&
			plannedContribution > 0 &&
			(realizedContribution === null || realizedContribution < plannedContribution)
		)
			causes.push("aporte");
		const returnShortfall =
			projectedGain !== null &&
			realizedGain !== null &&
			projectedGain - realizedGain > Math.abs(projectedGain) * threshold &&
			!approxEqual(projectedGain, realizedGain);
		// Sem evidência de aplicação, aporte positivo e fechamento sem crescimento sugerem caixa parado;
		// perdas também podem explicar o padrão, portanto a causa é provável, nunca comprovada.
		const idle =
			realizedContribution !== null &&
			realizedContribution > 0 &&
			realizedValue !== null &&
			previousRealized !== null &&
			(realizedValue <= previousRealized || approxEqual(realizedValue, previousRealized));
		if (idle) causes.push("dinheiro parado");
		else if (returnShortfall) causes.push("rendimento");
		for (const cause of causes)
			findings.push({
				code:
					cause === "aporte"
						? "contribution_shortfall"
						: cause === "rendimento"
							? "return_shortfall"
							: "idle_cash",
				severity: "warning",
				subject: month,
				message: `Alerta: revisão necessária em ${month}; causa provável: ${cause}.`,
			});
		rows.push({
			month,
			plannedContribution,
			projectedValue,
			realizedContribution,
			realizedValue,
			projectedGain,
			realizedGain,
			causes,
		});
	}
	notVerified.push(
		`Ganho do primeiro fechamento (${start}) não calculado: falta fechamento anterior ao plano.`,
	);
	return createAnalysisResult({
		method: { id: methodIds.goalTracking, version: "1.0.0" },
		strategyVersion: input.strategyVersion,
		asOf: `${input.asOf}-01`,
		inputs: input,
		assumptions: {
			alertThreshold: threshold,
			initialMonth: start,
			idleCash:
				"Aporte declarado positivo e fechamento sem crescimento: causa provável, também compatível com perdas.",
		},
		sources: evidence.sources,
		notVerified,
		findings,
		status: aligned.coverage === "complete" ? "complete" : "partial",
		output: {
			targetValue: input.targetValue,
			targetMonth: input.targetMonth,
			months: rows,
			coverage: aligned.coverage,
		},
	});
}
