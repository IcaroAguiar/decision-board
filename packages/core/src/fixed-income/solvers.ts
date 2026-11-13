import { finite } from "./rates.js";
import { prepareRedemption, type RedemptionInput } from "./taxation.js";

/** Bisseção de [0, 5] até 1e-10 leva cerca de 36 passos; o teto só detecta não convergência. */
const maxBisectionIterations = 256;

export class SolverFailure extends Error {}

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
	function evaluate(parameter: number): number {
		try {
			return finite(value(parameter));
		} catch (error) {
			throw new SolverFailure(
				error instanceof Error ? error.message : "Falha na avaliação numérica.",
			);
		}
	}
	let left = lower;
	let right = upper;
	const lowValue = evaluate(left);
	const highValue = evaluate(right);
	if (lowValue >= highValue)
		throw new SolverFailure("O cenário não define um empate crescente único no intervalo.");
	if (target < lowValue || target > highValue)
		throw new SolverFailure("O empate não está contido no intervalo informado.");
	if (target === lowValue) return left;
	if (target === highValue) return right;
	for (let i = 0; i < maxBisectionIterations; i += 1) {
		const mid = (left + right) / 2;
		if (right - left <= tolerance) return mid;
		if (mid === left || mid === right)
			throw new SolverFailure("A tolerância excede a precisão numérica disponível.");
		if (evaluate(mid) < target) left = mid;
		else right = mid;
	}
	throw new SolverFailure("O empate não convergiu com a tolerância informada.");
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
	const evaluate = prepareRedemption({ ...investment, taxExempt: product === "lci" });
	for (const step of investment.scenario.steps) {
		if (step.annualRate < 0) throw new SolverFailure("CDI negativo impede o solver crescente.");
	}
	return bisectIncreasing(
		(multiplier) => evaluate({ kind: "cdi-percentage", multiplier }).net,
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
		throw new SolverFailure("O ponto de virada exige um candidato prefixado.");
	if (
		prefixed.principal !== postfixed.principal ||
		prefixed.from !== postfixed.from ||
		prefixed.to !== postfixed.to
	) {
		throw new Error("O ponto de virada exige o mesmo principal e período nos dois cenários.");
	}
	const target = prepareRedemption(prefixed)(prefixed.rate).net;
	const evaluate = prepareRedemption({ ...postfixed, scenario: prefixed.scenario });
	return bisectIncreasing(
		(annualRate) => evaluate({ kind: "prefixed", annualRate }).net,
		target,
		solver,
	);
}
