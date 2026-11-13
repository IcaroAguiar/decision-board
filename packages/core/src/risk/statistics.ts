const monthsPerYear = 12;

function assertFiniteSeries(xs: readonly number[], label = "A série"): void {
	for (const value of xs) {
		if (!Number.isFinite(value)) {
			throw new Error(`${label} deve conter apenas números finitos.`);
		}
	}
}

function isConstant(xs: readonly number[]): boolean {
	const first = xs[0];
	if (first === undefined) return true;
	return xs.every((value) => value === first);
}

export function mean(xs: readonly number[]): number {
	if (xs.length === 0) {
		throw new Error("A série não pode ser vazia para calcular a média.");
	}
	assertFiniteSeries(xs);
	let sum = 0;
	for (const value of xs) {
		sum += value;
	}
	const result = sum / xs.length;
	if (!Number.isFinite(result)) {
		throw new Error("A média excede o intervalo numérico finito.");
	}
	return result;
}

// Todos os estimadores de dispersão (variância, desvio e covariância) usam denominador amostral (n - 1).
export function sampleVariance(xs: readonly number[]): number {
	if (xs.length < 2) {
		throw new Error("A variância amostral exige pelo menos 2 observações.");
	}
	const avg = mean(xs);
	if (isConstant(xs)) return 0;
	let sumSq = 0;
	for (const value of xs) {
		const diff = value - avg;
		sumSq += diff * diff;
	}
	const variance = sumSq / (xs.length - 1);
	if (!Number.isFinite(variance)) {
		throw new Error("A variância amostral excede o intervalo numérico finito.");
	}
	return variance;
}

export function sampleStdev(xs: readonly number[]): number {
	return Math.sqrt(sampleVariance(xs));
}

export function covariance(xs: readonly number[], ys: readonly number[]): number {
	if (xs.length !== ys.length) {
		throw new Error("As séries devem ter o mesmo tamanho.");
	}
	if (xs.length < 2) {
		throw new Error("A covariância amostral exige pelo menos 2 observações.");
	}
	const meanX = mean(xs);
	const meanY = mean(ys);
	if (isConstant(xs) || isConstant(ys)) return 0;
	let sumProd = 0;
	for (let i = 0; i < xs.length; i += 1) {
		const x = xs[i];
		const y = ys[i];
		if (x === undefined || y === undefined) continue;
		sumProd += (x - meanX) * (y - meanY);
	}
	const cov = sumProd / (xs.length - 1);
	if (!Number.isFinite(cov)) {
		throw new Error("A covariância amostral excede o intervalo numérico finito.");
	}
	return cov;
}

export function pearson(xs: readonly number[], ys: readonly number[]): number {
	if (xs.length !== ys.length) {
		throw new Error("As séries devem ter o mesmo tamanho.");
	}
	if (xs.length < 3) {
		throw new Error("A correlação de Pearson exige pelo menos 3 observações.");
	}
	const meanX = mean(xs);
	const meanY = mean(ys);
	if (isConstant(xs) || isConstant(ys)) {
		throw new Error("Variância nula impede o cálculo da correlação de Pearson.");
	}
	let sumSqX = 0;
	let sumSqY = 0;
	let sumProd = 0;
	for (let i = 0; i < xs.length; i += 1) {
		const x = xs[i];
		const y = ys[i];
		if (x === undefined || y === undefined) continue;
		const dx = x - meanX;
		const dy = y - meanY;
		sumSqX += dx * dx;
		sumSqY += dy * dy;
		sumProd += dx * dy;
	}
	const denom = Math.sqrt(sumSqX) * Math.sqrt(sumSqY);
	if (denom === 0 || !Number.isFinite(denom)) {
		throw new Error("Variância nula impede o cálculo da correlação de Pearson.");
	}
	const r = sumProd / denom;
	if (!Number.isFinite(r)) {
		throw new Error("A correlação de Pearson não produziu um resultado finito.");
	}
	// Limita desvios de arredondamento de ponto flutuante apenas fora de [-1, 1].
	return Math.max(-1, Math.min(1, r));
}

export function annualizeMonthlyVolatility(monthlyVolatility: number): number {
	if (!Number.isFinite(monthlyVolatility) || monthlyVolatility < 0) {
		throw new Error("A volatilidade mensal deve ser um número finito não negativo.");
	}
	return monthlyVolatility * Math.sqrt(monthsPerYear);
}
