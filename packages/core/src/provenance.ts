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
			// Soma float64 sem arredondamento; compare resultados com approxEqual de units.ts.
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

export function collectEvidence(datums: Datum<unknown>[]): {
	sources: SourceRef[];
	notVerified: string[];
	hasMissing: boolean;
} {
	const sources = new Map<string, SourceRef>();
	const reasons = new Set<string>();
	const notVerified: string[] = [];
	let hasMissing = false;
	for (const datum of datums) {
		if (datum.status === "missing") {
			hasMissing = true;
			if (!reasons.has(datum.reason)) {
				reasons.add(datum.reason);
				notVerified.push(datum.reason);
			}
		} else if (!sources.has(datum.source.id)) {
			sources.set(datum.source.id, datum.source);
			if (!datum.source.official) notVerified.push(`Fonte não oficial: ${datum.source.label}`);
		}
	}
	return { sources: [...sources.values()], notVerified, hasMissing };
}

/** Normaliza sobre o total conhecido; total zero não define pesos e tem cobertura vazia. */
export function weightsWithCoverage(items: { key: string; value: Datum<number> }[]): {
	weights: Record<string, number>;
	coverage: "complete" | "partial" | "empty";
	missingKeys: string[];
} {
	const keys = new Set<string>();
	const missingKeys: string[] = [];
	const entries: [string, number][] = [];
	for (const item of items) {
		if (keys.has(item.key)) throw new Error("As chaves dos pesos devem ser únicas.");
		keys.add(item.key);
		if (item.value.status === "missing") missingKeys.push(item.key);
		else {
			if (item.value.value < 0) throw new Error("Os valores dos pesos não podem ser negativos.");
			entries.push([item.key, item.value.value]);
		}
	}
	const { total, coverage } = sumWithCoverage(items.map((item) => item.value));
	return {
		weights: Object.fromEntries(
			total === 0 ? [] : entries.map(([key, value]) => [key, value / total]),
		),
		coverage: total === 0 ? "empty" : coverage,
		missingKeys,
	};
}
