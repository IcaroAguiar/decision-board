import { calendarDaysBetween, parseIsoDate } from "../calendar.js";
import {
	type AccrualRate,
	businessDates,
	compound,
	createRatePath,
	dailyGrowthFactor,
	finite,
	type GrowthInput,
	nonNegative,
} from "./rates.js";

export interface TaxTable {
	validFrom: string;
	validUntil?: string;
	brackets: readonly { throughCalendarDays: number | null; rate: number }[];
}
/** Tabela parametrizável; vigência declarada, sem consulta à regra tributária atual. */
export const defaultRegressiveIncomeTaxTable: TaxTable = {
	validFrom: "2005-01-01",
	brackets: [
		{ throughCalendarDays: 180, rate: 0.225 },
		{ throughCalendarDays: 360, rate: 0.2 },
		{ throughCalendarDays: 720, rate: 0.175 },
		{ throughCalendarDays: null, rate: 0.15 },
	],
};
export interface CustodyFee {
	validFrom: string;
	validUntil?: string;
	annualRate: number;
	exemptBalance: number;
}
export function assertValidity(
	table: { validFrom: string; validUntil?: string },
	asOf: string,
): void {
	parseIsoDate(table.validFrom);
	parseIsoDate(asOf);
	if (table.validUntil !== undefined) {
		calendarDaysBetween(table.validFrom, table.validUntil);
	}
	if (asOf < table.validFrom || (table.validUntil !== undefined && asOf > table.validUntil)) {
		throw new Error("A tabela informada não tem vigência na data da análise.");
	}
}
export function incomeTaxRate(table: TaxTable, heldCalendarDays: number, asOf: string): number {
	assertValidity(table, asOf);
	if (!Number.isSafeInteger(heldCalendarDays) || heldCalendarDays < 0) {
		throw new Error("O prazo corrido deve ser um inteiro não negativo.");
	}
	let previous = -1;
	let selected: number | undefined;
	let hasFinal = false;
	for (const bracket of table.brackets) {
		if (hasFinal || nonNegative(bracket.rate) > 1) throw new Error("Tabela de IR inválida.");
		if (bracket.throughCalendarDays === null) hasFinal = true;
		else {
			if (
				!Number.isSafeInteger(bracket.throughCalendarDays) ||
				bracket.throughCalendarDays <= previous
			) {
				throw new Error("Os limites da tabela de IR devem ser crescentes.");
			}
			previous = bracket.throughCalendarDays;
		}
		if (
			selected === undefined &&
			(bracket.throughCalendarDays === null || heldCalendarDays <= bracket.throughCalendarDays)
		) {
			selected = bracket.rate;
		}
	}
	if (!hasFinal || selected === undefined)
		throw new Error("A tabela de IR deve cobrir todos os prazos.");
	return selected;
}

export interface AccrualPoint {
	businessDate: string;
	gross: number;
	custodyAccrued: number;
}

export interface RedemptionValue {
	evolution: AccrualPoint[];
	gross: number;
	incomeTax: number;
	custody: number;
	net: number;
	businessDays: number;
	calendarDays: number;
	nature: "estimated";
}
export interface RedemptionInput extends GrowthInput {
	asOf: string;
	taxTable: TaxTable;
	taxExempt: boolean;
	custody: CustodyFee;
}
export function redemptionValue(input: RedemptionInput): RedemptionValue {
	return prepareRedemption(input)(input.rate);
}

/** Prepara o período e o CDI uma vez; avaliações do solver só capitalizam. */
export function prepareRedemption(input: Omit<RedemptionInput, "rate">) {
	assertValidity(input.custody, input.asOf);
	nonNegative(input.custody.annualRate);
	nonNegative(input.custody.exemptBalance);
	const held = calendarDaysBetween(input.from, input.to);
	const taxRate = incomeTaxRate(input.taxTable, held, input.asOf);
	const dates = businessDates(input.calendar, input.from, input.to);
	nonNegative(input.principal);
	const path = createRatePath(input.scenario.steps);
	let cdiFactors: number[] | undefined;
	const cdiFactorAt = (index: number): number => {
		cdiFactors ??= dates.map((date) => path.dailyFactor(date));
		const factor = cdiFactors[index];
		if (factor === undefined) throw new Error("Fator do CDI ausente para a data de capitalização.");
		return factor;
	};
	return (rate: AccrualRate): RedemptionValue => {
		let custody = 0;
		const evolution: AccrualPoint[] = [];
		const balance = compound(
			input.principal,
			dates,
			(index) => dailyGrowthFactor(rate, rate.kind === "prefixed" ? 1 : cdiFactorAt(index)),
			(date, opening, closing) => {
				custody = finite(
					custody +
						(Math.max(0, opening - input.custody.exemptBalance) * input.custody.annualRate) / 252,
				);
				evolution.push({ businessDate: date, gross: closing, custodyAccrued: custody });
			},
		);

		const incomeTax = input.taxExempt ? 0 : Math.max(0, balance - input.principal) * taxRate;
		return {
			evolution,
			gross: balance,
			incomeTax,
			custody,
			net: finite(balance - incomeTax - custody),
			businessDays: dates.length,
			calendarDays: held,
			nature: "estimated",
		};
	};
}
