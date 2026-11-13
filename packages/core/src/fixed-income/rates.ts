import { type BusinessCalendar, calendarDaysBetween, parseIsoDate } from "../calendar.js";

/** Base anual da capitalização por dias úteis (convenção ANBIMA/B3). */
export const businessDaysPerYear = 252;

export interface RateStep {
	effectiveFrom: string;
	annualRate: number;
}
export interface RateScenario {
	id: string;
	kind: "focus-like" | "alternative" | "manual";
	steps: readonly RateStep[];
}
export type AccrualRate =
	| { kind: "cdi-percentage"; multiplier: number }
	| { kind: "cdi-spread"; annualSpread: number }
	| { kind: "prefixed"; annualRate: number }
	| { kind: "selic-like" };

export function finite(value: number): number {
	if (!Number.isFinite(value)) throw new Error("O valor deve ser finito na simulação.");
	return value;
}
export function nonNegative(value: number): number {
	if (finite(value) < 0) throw new Error("O valor deve ser não negativo na simulação.");
	return value;
}
export function annualFactor(rate: number): number {
	if (finite(rate) <= -1) throw new Error("A taxa anual deve ser maior que -1.");
	return (1 + rate) ** (1 / businessDaysPerYear);
}

export function createRatePath(steps: readonly RateStep[]) {
	if (steps.length === 0) throw new Error("Informe o caminho de taxas do cenário.");
	let previous: string | undefined;
	const path = steps.map((step) => {
		parseIsoDate(step.effectiveFrom);
		annualFactor(step.annualRate);
		if (previous !== undefined && previous >= step.effectiveFrom) {
			throw new Error("As datas do caminho devem estar em ordem estritamente crescente.");
		}
		previous = step.effectiveFrom;
		return { ...step };
	});
	function annualRateOn(date: string): number {
		parseIsoDate(date);
		let rate: number | undefined;
		for (const step of path) {
			if (step.effectiveFrom > date) break;
			rate = step.annualRate;
		}
		if (rate === undefined) throw new Error(`O caminho de taxas não cobre a data ${date}.`);
		return rate;
	}
	return { annualRateOn, dailyFactor: (date: string) => annualFactor(annualRateOn(date)) };
}

export function dailyGrowthFactor(rate: AccrualRate, cdiFactor: number): number {
	switch (rate.kind) {
		case "prefixed":
			return annualFactor(rate.annualRate);
		case "selic-like":
			return cdiFactor;
		case "cdi-percentage":
			return finite(1 + nonNegative(rate.multiplier) * (cdiFactor - 1));
		case "cdi-spread":
			return finite(cdiFactor * annualFactor(rate.annualSpread));
		default: {
			const exhaustive: never = rate;
			return exhaustive;
		}
	}
}

/** Intervalo [from,to); o calendário valida inclusive a cobertura do resgate. */
export function businessDates(calendar: BusinessCalendar, from: string, to: string): string[] {
	const count = calendar.businessDaysBetween(from, to);
	const days: string[] = [];
	if (count === 0) return days;
	let date = calendar.adjustToBusinessDay(from, "following");
	for (let i = 0; i < count; i += 1) {
		days.push(date);
		if (i + 1 < count) date = calendar.addBusinessDays(date, 1);
	}
	return days;
}

export interface GrowthInput {
	principal: number;
	from: string;
	to: string;
	rate: AccrualRate;
	scenario: RateScenario;
	calendar: BusinessCalendar;
}

export function compound(
	principal: number,
	dates: readonly string[],
	factorOn: (index: number) => number,
	onDay: (date: string, opening: number, closing: number) => void = () => {},
): number {
	let balance = nonNegative(principal);
	for (const [index, date] of dates.entries()) {
		const factor = factorOn(index);
		if (factor <= 0) throw new Error("O fator diário deve ser positivo na simulação.");
		const closing = finite(balance * factor);
		onDay(date, balance, closing);
		balance = closing;
	}
	return balance;
}

export function grow(input: GrowthInput): number {
	calendarDaysBetween(input.from, input.to);
	const path = createRatePath(input.scenario.steps);
	const dates = businessDates(input.calendar, input.from, input.to);
	return compound(input.principal, dates, (index) => {
		const date = dates[index];
		if (date === undefined) throw new Error("Data de capitalização ausente.");
		return dailyGrowthFactor(
			input.rate,
			input.rate.kind === "prefixed" ? 1 : path.dailyFactor(date),
		);
	});
}
