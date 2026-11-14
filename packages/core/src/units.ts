/**
 * Taxas e percentuais são frações decimais: 0.1375 = 13,75%; a base anual é 252 DU,
 * salvo nome explícito como monthlyReturn. Percentual do CDI é multiplicador: 1.05 = 105%.
 * Choques em pontos percentuais também são decimais: +1 p.p. = 0.01.
 * Arredonde somente na apresentação; o motor nunca arredonda valores intermediários.
 */
export type PortfolioPart = "reserve" | "goal" | "variableIncome";
export const portfolioParts: readonly PortfolioPart[] = ["reserve", "goal", "variableIncome"];

/** Compara float64 com tolerância relativa padrão de 1e-12 e absoluta opcional. */
export function approxEqual(
	a: number,
	b: number,
	{ relative = 1e-12, absolute = 0 }: { relative?: number; absolute?: number } = {},
): boolean {
	if (!Number.isFinite(relative) || relative < 0 || !Number.isFinite(absolute) || absolute < 0) {
		throw new Error("As tolerâncias devem ser finitas e não negativas.");
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
	return Math.abs(a - b) <= Math.max(absolute, relative * Math.max(Math.abs(a), Math.abs(b)));
}
