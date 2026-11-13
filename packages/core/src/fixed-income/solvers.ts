import { finite, nonNegative } from "./rates.js";
import { type RedemptionInput, redemptionValue } from "./taxation.js";

export interface SolverOptions {
	lower?: number;
	upper?: number;
	tolerance?: number;
}
/** Bisseção com erro no parâmetro <= 1e-10 por padrão; intervalo deve conter raiz única. */
export function bisectIncreasing(
	value: (parameter: number) => number,
	target: number,
	{ lower = 0, upper = 5, tolerance = 1e-10 }: SolverOptions = {},
): number {
	finite(target);
	finite(lower);
	finite(upper);
	if (lower >= upper || finite(tolerance) <= 0)
		throw new Error("Intervalo ou tolerância de empate inválido.");
	let left = lower;
	let right = upper;
	const lowValue = finite(value(left));
	const highValue = finite(value(right));
	if (lowValue >= highValue)
		throw new Error("O cenário não define um empate crescente único no intervalo.");
	if (target < lowValue || target > highValue)
		throw new Error("O empate não está contido no intervalo informado.");
	if (target === lowValue) return left;
	if (target === highValue) return right;
	for (let i = 0; i < 256; i += 1) {
		const mid = (left + right) / 2;
		if (right - left <= tolerance) return mid;
		if (mid === left || mid === right)
			throw new Error("A tolerância excede a precisão numérica disponível.");
		if (finite(value(mid)) < target) left = mid;
		else right = mid;
	}
	throw new Error("O empate não convergiu com a tolerância informada.");
}

export function breakEvenCdi({
	targetNet,
	product,
	investment,
	solver,
}: {
	targetNet: number;
	product: "cdb" | "lci";
	investment: Omit<RedemptionInput, "rate" | "taxExempt">;
	solver?: SolverOptions;
}): number {
	// Com CDI negativo ou custódia muito alta, não se pressupõe monotonicidade.
	for (const step of investment.scenario.steps) nonNegative(step.annualRate);
	return bisectIncreasing(
		(multiplier) =>
			redemptionValue({
				...investment,
				rate: { kind: "cdi-percentage", multiplier },
				taxExempt: product === "lci",
			}).net,
		targetNet,
		solver,
	);
}

export function turningPoint({
	prefixed,
	postfixed,
	solver,
}: {
	prefixed: RedemptionInput;
	postfixed: Omit<RedemptionInput, "rate" | "scenario">;
	solver?: SolverOptions;
}): number {
	if (prefixed.rate.kind !== "prefixed")
		throw new Error("O ponto de virada exige um candidato prefixado.");
	if (
		prefixed.principal !== postfixed.principal ||
		prefixed.from !== postfixed.from ||
		prefixed.to !== postfixed.to
	) {
		throw new Error("O ponto de virada exige o mesmo principal e período nos dois cenários.");
	}
	return bisectIncreasing(
		(annualRate) =>
			redemptionValue({
				...postfixed,
				rate: { kind: "selic-like" },
				scenario: {
					id: "constant-equivalent",
					kind: "manual",
					steps: [{ effectiveFrom: postfixed.from, annualRate }],
				},
			}).net,
		redemptionValue(prefixed).net,
		solver,
	);
}
