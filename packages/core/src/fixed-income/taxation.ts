import { calendarDaysBetween, parseIsoDate } from "../calendar.js";
import {
	type AccrualRate,
	businessDates,
	businessDaysPerYear,
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
/** Alíquota de IOF sobre o rendimento por dia corrido: índice 0 = 1 dia; a partir do fim da lista, zero. */
export interface IofTable {
	validFrom: string;
	validUntil?: string;
	ratesByCalendarDay: readonly number[];
}
/** Tabela regressiva do Decreto 6.306/2007 (anexo), de 96% no 1º dia a 3% no 29º; parametrizável. */
export const defaultRegressiveIofTable: IofTable = {
	validFrom: "2008-01-01",
	ratesByCalendarDay: [
		0.96, 0.93, 0.9, 0.86, 0.83, 0.8, 0.76, 0.73, 0.7, 0.66, 0.63, 0.6, 0.56, 0.53, 0.5, 0.46, 0.43,
		0.4, 0.36, 0.33, 0.3, 0.26, 0.23, 0.2, 0.16, 0.13, 0.1, 0.06, 0.03,
	],
};
export function iofRate(table: IofTable, heldCalendarDays: number, asOf: string): number {
	assertValidity(table, asOf);
	if (!Number.isSafeInteger(heldCalendarDays) || heldCalendarDays < 0) {
		throw new Error("O prazo corrido deve ser um inteiro não negativo.");
	}
	for (const rate of table.ratesByCalendarDay) {
		if (nonNegative(rate) > 1) throw new Error("Tabela de IOF inválida.");
	}
	return table.ratesByCalendarDay[Math.max(heldCalendarDays, 1) - 1] ?? 0;
}
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
	iof: number;
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
	/** Padrão: `defaultRegressiveIofTable`. */
	iofTable?: IofTable;
	taxExempt: boolean;
	/** IOF independe da isenção de IR: LCI paga IOF regressivo, LCA tem alíquota zero. */
	iofExempt?: boolean;
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
	const iofFraction = input.iofExempt
		? 0
		: iofRate(input.iofTable ?? defaultRegressiveIofTable, held, input.asOf);
	const dates = businessDates(input.calendar, input.from, input.to);
	nonNegative(input.principal);
	const lazyFactors = (steps: readonly { effectiveFrom: string; annualRate: number }[]) => {
		const path = createRatePath(steps);
		let factors: number[] | undefined;
		return (index: number): number => {
			factors ??= dates.map((date) => path.dailyFactor(date));
			const factor = factors[index];
			if (factor === undefined)
				throw new Error("Fator do indexador ausente para a data de capitalização.");
			return factor;
		};
	};
	const cdiFactorAt = lazyFactors(input.scenario.steps);
	const selicFactorAt =
		input.scenario.selicSteps === undefined ? cdiFactorAt : lazyFactors(input.scenario.selicSteps);
	return (rate: AccrualRate): RedemptionValue => {
		let custody = 0;
		const evolution: AccrualPoint[] = [];
		const balance = compound(
			input.principal,
			dates,
			(index) =>
				dailyGrowthFactor(
					rate,
					rate.kind === "prefixed"
						? 1
						: rate.kind === "selic-like"
							? selicFactorAt(index)
							: cdiFactorAt(index),
				),
			(date, opening, closing) => {
				custody = finite(
					custody +
						(Math.max(0, opening - input.custody.exemptBalance) * input.custody.annualRate) /
							businessDaysPerYear,
				);
				evolution.push({ businessDate: date, gross: closing, custodyAccrued: custody });
			},
		);

		const gain = Math.max(0, balance - input.principal);
		// O IR incide sobre o rendimento já deduzido do IOF.
		const iof = gain * iofFraction;
		const incomeTax = input.taxExempt ? 0 : (gain - iof) * taxRate;
		return {
			evolution,
			gross: balance,
			iof,
			incomeTax,
			custody,
			net: finite(balance - iof - incomeTax - custody),
			businessDays: dates.length,
			calendarDays: held,
			nature: "estimated",
		};
	};
}
