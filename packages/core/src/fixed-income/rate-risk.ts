import { type AnalysisFinding, createAnalysisResult, methodIds } from "../analysis.js";
import { type BusinessCalendar, parseIsoDate } from "../calendar.js";
import { collectEvidence, type Datum } from "../provenance.js";
import { annualFactor, businessDaysPerYear, finite, nonNegative } from "./rates.js";

export interface ZeroCouponBond {
	id: string;
	face: number;
	annualYield: number;
	maturity: string;
}
export interface RateRiskInput {
	asOf: string;
	strategyVersion: string | null;
	bond: Datum<ZeroCouponBond>;
	goalDate: Datum<string>;
	/** Prazo máximo contado da análise em DU, não em dias corridos. */
	strategyMaxBusinessDays?: number;
	shock?: number;
}

export function zeroCouponPrice(face: number, annualYield: number, businessDays: number): number {
	nonNegative(face);
	annualFactor(annualYield);
	if (!Number.isSafeInteger(businessDays) || businessDays < 0)
		throw new Error("O prazo em DU deve ser um inteiro não negativo.");
	return finite(face / (1 + annualYield) ** (businessDays / businessDaysPerYear));
}
export interface RateRiskOutput {
	nature: "estimated";
	businessDays: number;
	price: number;
	modifiedDuration: number;
	durationPriceChange: number;
	durationRelativeChange: number;
	repricedPrice: number;
	repricingPriceChange: number;
	repricingRelativeChange: number;
	approximationError: number;
}
export function analyzeRateRisk(input: RateRiskInput, calendar: BusinessCalendar) {
	parseIsoDate(input.asOf);
	const shock = finite(input.shock ?? 0.01);
	if (
		input.strategyMaxBusinessDays !== undefined &&
		(!Number.isSafeInteger(input.strategyMaxBusinessDays) || input.strategyMaxBusinessDays < 0)
	) {
		throw new Error("O prazo máximo da estratégia deve ser um inteiro não negativo de DU.");
	}
	const evidence = collectEvidence([input.bond, input.goalDate]);
	const common = {
		method: { id: methodIds.rateRisk, version: "1.0.0" },
		strategyVersion: input.strategyVersion,
		asOf: input.asOf,
		inputs: input,
		assumptions: {
			calendar: {
				coveredFrom: calendar.coverage.from,
				coveredUntil: calendar.coverage.until,
				holidayCount: calendar.holidays.length,
				holidays: [...calendar.holidays],
			},
			shock,
			strategyMaxBusinessDays: input.strategyMaxBusinessDays ?? null,
			model: "Título sem cupom; base 252 DU; duração modificada = (DU/252)/(1+y)",
		},
		sources: evidence.sources,
		natures: evidence.natures,
		notVerified: [
			"Duração calculada apenas para títulos sem cupom.",
			"preço efetivo de recompra pelo Tesouro",
			"liquidez de papéis privados no secundário",
			...evidence.notVerified,
		],
	};
	const findings: AnalysisFinding[] = [];
	if (input.bond.status === "missing") {
		return createAnalysisResult<RateRiskInput, RateRiskOutput, typeof common.assumptions>({
			...common,
			status: "inconclusive",
			output: null,
			findings: [
				{
					code: "MISSING_BOND",
					severity: "blocked",
					message: "Dados insuficientes para simular o risco de juros.",
				},
			],
		});
	}
	const bond = input.bond.value;
	parseIsoDate(bond.maturity);
	if (bond.maturity < input.asOf) {
		const message = "Título vencido antes da data da análise.";
		return createAnalysisResult<RateRiskInput, RateRiskOutput, typeof common.assumptions>({
			...common,
			status: "inconclusive",
			output: null,
			findings: [{ code: "MATURED_BOND", severity: "warning", subject: bond.id, message }],
			notVerified: [...common.notVerified, message],
		});
	}
	const businessDays = calendar.businessDaysBetween(input.asOf, bond.maturity);
	let pastGoal = false;
	if (input.goalDate.status === "known") {
		parseIsoDate(input.goalDate.value);
		if (input.goalDate.value < input.asOf) {
			pastGoal = true;
			const message = "Objetivo anterior à data da análise.";
			findings.push({ code: "PAST_GOAL", severity: "warning", subject: bond.id, message });
			common.notVerified.push(message);
		}
		if (!pastGoal && bond.maturity > input.goalDate.value)
			findings.push({
				code: "MATURITY_AFTER_GOAL",
				severity: "warning",
				subject: bond.id,
				message: "Alerta: o vencimento ultrapassa a data do objetivo neste cenário.",
			});
	}
	if (input.strategyMaxBusinessDays !== undefined && businessDays > input.strategyMaxBusinessDays)
		findings.push({
			code: "MATURITY_AFTER_STRATEGY_LIMIT",
			severity: "warning",
			subject: bond.id,
			message: "Alerta: o prazo ultrapassa o máximo definido na estratégia.",
		});
	const price = zeroCouponPrice(bond.face, bond.annualYield, businessDays);
	if (price <= 0) throw new Error("O PU deve ser positivo para calcular a variação relativa.");
	const modifiedDuration = finite(businessDays / businessDaysPerYear / (1 + bond.annualYield));
	const durationRelativeChange = finite(-modifiedDuration * shock);
	const repricedPrice = zeroCouponPrice(bond.face, bond.annualYield + shock, businessDays);
	const repricingPriceChange = finite(repricedPrice - price);
	return createAnalysisResult<RateRiskInput, RateRiskOutput, typeof common.assumptions>({
		...common,
		status: pastGoal || evidence.hasMissing ? "partial" : "complete",
		findings,
		output: {
			nature: "estimated",
			businessDays,
			price,
			modifiedDuration,
			durationRelativeChange,
			durationPriceChange: finite(price * durationRelativeChange),
			repricedPrice,
			repricingPriceChange,
			repricingRelativeChange: finite(repricingPriceChange / price),
			approximationError: finite(durationRelativeChange - repricingPriceChange / price),
		},
	});
}
