const millisecondsPerDay = 86_400_000;

export function parseIsoDate(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw new Error("Data inválida: use YYYY-MM-DD.");
	}
	const date = new Date(`${value}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
		throw new Error("Data inválida no calendário.");
	}
	return value;
}

export function calendarDaysBetween(start: string, end: string): number {
	const startTime = dateInUtc(start).getTime();
	const endTime = dateInUtc(end).getTime();
	if (endTime < startTime) {
		throw new Error("A data final não pode ser anterior à inicial.");
	}
	return (endTime - startTime) / millisecondsPerDay;
}

export interface BusinessCalendar {
	adjustToBusinessDay(date: string, direction: "following" | "preceding"): string;
	isBusinessDay(date: string): boolean;
	businessDaysBetween(start: string, end: string): number;
	addBusinessDays(date: string, n: number): string;
}

export function createBusinessCalendar({
	holidays,
	coveredFrom,
	coveredUntil,
}: {
	holidays: readonly string[];
	coveredFrom: string;
	coveredUntil: string;
}): BusinessCalendar {
	calendarDaysBetween(coveredFrom, coveredUntil);
	function assertCovered(date: string): void {
		parseIsoDate(date);
		if (date < coveredFrom || date > coveredUntil) {
			throw new Error(`O calendário de feriados não cobre a data ${date}.`);
		}
	}
	const holidaySet = new Set(holidays.map(parseIsoDate));
	function isBusinessDay(date: string): boolean {
		assertCovered(date);
		const day = dateInUtc(date).getUTCDay();
		return day !== 0 && day !== 6 && !holidaySet.has(date);
	}

	return {
		isBusinessDay,
		adjustToBusinessDay(date, direction) {
			let result = date;
			while (!isBusinessDay(result)) {
				result = shiftDate(result, direction === "following" ? 1 : -1);
			}
			return result;
		},
		businessDaysBetween(start, end) {
			calendarDaysBetween(start, end);
			assertCovered(start);
			assertCovered(end);
			let count = 0;
			// Convenção DU da ANBIMA/B3: [início, fim), incluindo o início útil.
			for (let date = start; date < end; date = nextDate(date)) {
				if (isBusinessDay(date)) count += 1;
			}
			return count;
		},
		addBusinessDays(date, n) {
			assertCovered(date);
			if (!Number.isSafeInteger(n) || n < 0) {
				throw new Error("A quantidade de dias úteis deve ser um inteiro não negativo seguro.");
			}
			if (n === 0 && !isBusinessDay(date)) {
				throw new Error("Para zero dias úteis, a data inicial deve ser útil.");
			}
			let result = date;
			for (let count = 0; count < n; ) {
				result = nextDate(result);
				if (isBusinessDay(result)) count += 1;
			}
			return result;
		},
	};
}

function dateInUtc(value: string): Date {
	return new Date(`${parseIsoDate(value)}T00:00:00.000Z`);
}

function nextDate(value: string): string {
	return shiftDate(value, 1);
}

function shiftDate(value: string, days: number): string {
	const next = new Date(dateInUtc(value).getTime() + days * millisecondsPerDay);
	return parseIsoDate(next.toISOString().slice(0, 10));
}
