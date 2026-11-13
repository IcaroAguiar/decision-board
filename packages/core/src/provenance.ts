import { calendarDaysBetween, parseIsoDate } from "./calendar.js";

export type DataNature = "informed" | "observed" | "estimated";

export interface SourceRef {
	id: string;
	label: string;
	asOf: string;
	url?: string;
	official: boolean;
}

export type Datum<T> =
	| { status: "known"; value: T; nature: DataNature; source: SourceRef }
	| { status: "missing"; reason: string };

export function known<T>(value: T, nature: DataNature, source: SourceRef): Datum<T> {
	parseIsoDate(source.asOf);
	return { status: "known", value, nature, source };
}

export function missing(reason: string): Datum<never> {
	if (!reason.trim()) {
		throw new Error("Informe o motivo do dado ausente.");
	}
	return { status: "missing", reason };
}

export function sumWithCoverage(items: Datum<number>[]): {
	total: number;
	coverage: "complete" | "partial" | "empty";
	knownCount: number;
	missingCount: number;
	missingReasons: string[];
} {
	let total = 0;
	let knownCount = 0;
	const missingReasons: string[] = [];
	for (const item of items) {
		if (item.status === "missing") {
			missingReasons.push(item.reason);
		} else {
			if (!Number.isFinite(item.value)) {
				throw new Error("O valor conhecido deve ser finito.");
			}
			// Soma float64 sem arredondamento monetário; comparações admitem erro relativo de 1e-12.
			total += item.value;
			if (!Number.isFinite(total)) {
				throw new Error("O total excede o intervalo numérico finito.");
			}
			knownCount += 1;
		}
	}
	const missingCount = missingReasons.length;
	return {
		total,
		coverage: knownCount === 0 ? "empty" : missingCount > 0 ? "partial" : "complete",
		knownCount,
		missingCount,
		missingReasons,
	};
}

export function assessFreshness<T>(
	datum: Datum<T>,
	asOf: string,
	maxAgeDays: number,
): { state: "fresh" | "stale" | "missing"; ageDays: number | null } {
	parseIsoDate(asOf);
	if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
		throw new Error("A idade máxima deve ser um número finito não negativo de dias.");
	}
	if (datum.status === "missing") return { state: "missing", ageDays: null };
	const ageDays = calendarDaysBetween(datum.source.asOf, asOf);
	return { state: ageDays > maxAgeDays ? "stale" : "fresh", ageDays };
}
