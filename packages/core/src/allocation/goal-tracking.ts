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

/**
 * Fechamentos mensais: o primeiro é a base, nunca um ganho sobre zero.
 * Atribuição mensal preserva ausências; o alerta usa ganhos acumulados apenas
 * nos meses com ganhos projetado e realizado conhecidos, acima do limite relativo.
 */
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
			points
				.filter((point) => point.month >= start && point.month <= input.asOf)
				.map((point) => point.value),
		),
	);
	const notVerified = [
		...evidence.notVerified,
		"A projeção congelada é um cenário condicionado às premissas do plano.",
	];
	for (const month of aligned.missingMonths)
		notVerified.push(`Mês sem cobertura completa: ${month}`);
	const maps = series.map((points) => new Map(points.map((point) => [point.month, point.value])));
	const valueAt = (index: number, month: YearMonth) => {
		const datum = maps[index]?.get(month);
		return datum?.status === "known" ? datum.value : null;
	};
	const rows: GoalTrackingMonth[] = [];
	const findings: AnalysisFinding[] = [];
	for (let monthIndex = 0; monthIndex < window.months; monthIndex++) {
		const month = addMonths(start, monthIndex);
		const plannedContribution = valueAt(0, month);
		const projectedValue = valueAt(1, month);
		const realizedContribution = valueAt(2, month);
		const realizedValue = valueAt(3, month);
		const previous = monthIndex > 0 ? addMonths(month, -1) : null;
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
			realizedContribution !== null &&
			realizedContribution < plannedContribution
		)
			causes.push("aporte");
		const returnShortfall =
			projectedGain !== null &&
			realizedGain !== null &&
			projectedGain > realizedGain &&
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
		if (realizedContribution === null) {
			causes.length = 0;
			notVerified.push(`Aporte do mês ${month} não informado.`);
		}
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
	const comparableMonths = rows.flatMap((row) =>
		row.projectedGain !== null && row.realizedGain !== null
			? [{ projectedGain: row.projectedGain, realizedGain: row.realizedGain }]
			: [],
	);
	const cumulativeProjectedGain = comparableMonths.reduce((sum, row) => sum + row.projectedGain, 0);
	const cumulativeRealizedGain = comparableMonths.reduce((sum, row) => sum + row.realizedGain, 0);
	const causes = [...new Set(rows.flatMap((row) => row.causes))];
	if (
		comparableMonths.length > 0 &&
		cumulativeProjectedGain - cumulativeRealizedGain >
			Math.abs(cumulativeProjectedGain) * threshold &&
		!approxEqual(
			cumulativeProjectedGain - cumulativeRealizedGain,
			Math.abs(cumulativeProjectedGain) * threshold,
		)
	) {
		findings.push({
			code: "cumulative_gain_shortfall",
			severity: "warning",
			message: `Alerta: ganho acumulado abaixo do cenário projetado; causas prováveis: ${causes.join(", ") || "não identificadas"}.`,
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
			cumulativeProjectedGain: comparableMonths.length > 0 ? cumulativeProjectedGain : null,
			cumulativeRealizedGain: comparableMonths.length > 0 ? cumulativeRealizedGain : null,
			comparableMonths: comparableMonths.length,
			coverage: aligned.coverage,
		},
	});
}
