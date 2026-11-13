import { parseIsoDate } from "./calendar.js";
import type { Datum } from "./provenance.js";

export type YearMonth = string;

export function parseYearMonth(value: string): YearMonth {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
		throw new Error("Mês inválido: use YYYY-MM.");
	}
	return value;
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
	if (!Number.isSafeInteger(n))
		throw new Error("A quantidade de meses deve ser um inteiro seguro.");
	const index = monthIndex(ym) + n;
	if (!Number.isSafeInteger(index) || index < 0 || index > 119999) {
		throw new Error("Mês fora do intervalo YYYY-MM.");
	}
	return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function monthsBetween(start: YearMonth, end: YearMonth): number {
	const months = monthIndex(end) - monthIndex(start);
	if (months < 0) throw new Error("O mês final não pode ser anterior ao inicial.");
	return months;
}

export function yearMonthOf(isoDate: string): YearMonth {
	return parseIsoDate(isoDate).slice(0, 7);
}

export interface MonthlyPoint {
	month: YearMonth;
	value: Datum<number>;
}
export type MonthlySeries = readonly MonthlyPoint[];

export function createMonthlySeries(points: readonly MonthlyPoint[]): MonthlySeries {
	let previous: YearMonth | undefined;
	for (const point of points) {
		parseYearMonth(point.month);
		if (previous !== undefined && point.month <= previous) {
			throw new Error("Os meses devem estar em ordem estritamente crescente, sem duplicatas.");
		}
		if (point.value.status === "known" && !Number.isFinite(point.value.value)) {
			throw new Error("O valor conhecido deve ser finito.");
		}
		previous = point.month;
	}
	return points.map((point) => ({ ...point }));
}

/** Janela inclusiva no fim; sem janela, usa o intervalo entre os extremos de todas as séries. */
export function alignSeries(
	series: readonly MonthlySeries[],
	window?: { end: YearMonth; months: number },
): {
	months: YearMonth[];
	values: number[][];
	overlap: number;
	requested: number | null;
	missingMonths: YearMonth[];
	coverage: "complete" | "partial" | "empty";
} {
	const maps = series.map(
		(points) => new Map(createMonthlySeries(points).map((point) => [point.month, point.value])),
	);
	const allMonths = [
		...new Set(series.flatMap((points) => points.map((point) => point.month))),
	].sort();
	let start = allMonths[0];
	let end = allMonths.at(-1);
	if (window) {
		parseYearMonth(window.end);
		if (!Number.isSafeInteger(window.months) || window.months <= 0) {
			throw new Error("A janela deve ter uma quantidade inteira positiva de meses.");
		}
		end = window.end;
		start = addMonths(end, 1 - window.months);
	}
	const months: YearMonth[] = [];
	const values: number[][] = maps.map(() => []);
	const missingMonths: YearMonth[] = [];
	if (start !== undefined && end !== undefined) {
		const span = monthsBetween(start, end) + 1;
		for (let i = 0; i < span; i += 1) {
			const month = addMonths(start, i);
			const row: number[] = [];
			for (const map of maps) {
				const datum = map.get(month);
				if (datum?.status === "known") row.push(datum.value);
			}
			if (maps.length === 0 || row.length !== maps.length) {
				missingMonths.push(month);
			} else {
				months.push(month);
				row.forEach((value, index) => {
					values[index]?.push(value);
				});
			}
		}
	}
	return {
		months,
		values,
		overlap: months.length,
		requested: window?.months ?? null,
		missingMonths,
		coverage: months.length === 0 ? "empty" : missingMonths.length > 0 ? "partial" : "complete",
	};
}

function monthIndex(ym: YearMonth): number {
	parseYearMonth(ym);
	return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
}
