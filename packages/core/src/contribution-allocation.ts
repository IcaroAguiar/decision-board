import { approxEqual, type PortfolioPart } from "./units.js";

export type ContributionCandidateMetric =
	| "price"
	| "lotSize"
	| "part"
	| "segment"
	| "dailyLiquidity"
	| "concentration";
export interface MetricSourceRef {
	metric: ContributionCandidateMetric;
	label: string;
	url?: string;
	capturedAt?: string;
}
export interface AllocationHolding {
	assetId: string;
	part: PortfolioPart;
	value: number;
	assetClass: string;
	institution: string;
	issuer?: string;
	segment?: string;
}
export interface PartContributionCandidate {
	assetId: string;
	ticker: string;
	currentPrice: number;
	part: PortfolioPart;
	assetClass: string;
	institution: string;
	issuer?: string;
	segment?: string;
	maxPrice?: number;
	lotSize?: number;
	priority?: number;
	dailyLiquidity?: number;
	concentration?: number;
	estimatedMonthlyDividendPerUnit?: number;
	metricSourceRefs: MetricSourceRef[];
}
export interface AllocationTarget {
	target: number;
	band: { min: number; max: number };
}
export interface PartContributionInput {
	positions: AllocationHolding[];
	contributionAmount: number;
	allowedAssetIds: string[];
	candidates: PartContributionCandidate[];
	partTargets: Record<PortfolioPart, AllocationTarget>;
	classTargets?: Record<string, AllocationTarget>;
	concentrationLimits?: {
		perAsset?: number;
		perClass?: number;
		perInstitution?: number;
		perIssuer?: number;
	};
	minDailyLiquidity?: number;
	maxConcentration?: number;
	minOperationValue: number;
}
export interface SimulatedContributionPlanItem {
	assetId: string;
	ticker: string;
	quantity: number;
	referencePrice: number;
	estimatedValue: number;
	estimatedMonthlyDividend?: number;
	metricSourceRefs: MetricSourceRef[];
}
export interface SimulationAuditFinding {
	code:
		| "candidate_outside_universe"
		| "missing_metric_source"
		| "missing_metric"
		| "price_above_limit"
		| "liquidity_below_minimum"
		| "concentration_above_limit"
		| "allocation_limit_reached"
		| "cash_unallocated";
	severity: "info" | "warning" | "blocked";
	ticker?: string;
	metric?: ContributionCandidateMetric;
	message: string;
}
export interface AuditableContributionSimulation {
	contributionAmount: number;
	investedAmount: number;
	remainingCash: number;
	planItems: SimulatedContributionPlanItem[];
	auditFindings: SimulationAuditFinding[];
	postAllocation: {
		totalValue: number;
		cash: number;
		byAsset: Record<string, number>;
		byClass: Record<string, number>;
		byInstitution: Record<string, number>;
		byIssuer: Record<string, number>;
		byPart: Partial<Record<PortfolioPart, number>>;
		bySegment: Record<string, number>;
	};
}
interface Bucket {
	key: string;
	value: number;
}
interface Candidate {
	input: PartContributionCandidate;
	buckets: string[];
	targets: (Bucket & { band: AllocationTarget["band"] })[];
	required: ContributionCandidateMetric[];
	concentration: number | undefined;
	quantity: number;
	invested: number;
}
interface EngineInput {
	contribution: number;
	allowed: string[];
	values: Map<string, number>;
	total: number;
	candidates: Candidate[];
	limits: Bucket[];
	minLiquidity: number | undefined;
	maxConcentration: number | undefined;
	minimum: number;
}

const assetKey = (assetId: string) => `asset:${assetId}`;
const partKey = (part: PortfolioPart) => `part:${part}`;
const classKey = (label: string) => `class:${label}`;
const institutionKey = (label: string) => `institution:${label}`;
const segmentKey = (label: string | undefined) => `segment:${label?.trim() || "unclassified"}`;
function add(values: Map<string, number>, key: string, value: number) {
	values.set(key, (values.get(key) ?? 0) + value);
}
function nonNegative(value: number, field: string) {
	if (!Number.isFinite(value) || value < 0)
		throw new Error(`${field}: informe um número finito não negativo.`);
}
function fraction(value: number, field: string) {
	nonNegative(value, field);
	if (value > 1) throw new Error(`${field}: use fração decimal entre 0 e 1.`);
}
export function validateAllocationTarget(target: AllocationTarget) {
	fraction(target.target, "target");
	fraction(target.band.min, "band.min");
	fraction(target.band.max, "band.max");
	if (target.band.min > target.target || target.target > target.band.max)
		throw new Error("O alvo deve estar dentro da faixa.");
}
export function validateAllocationTargets(
	input: Pick<PartContributionInput, "partTargets" | "classTargets">,
) {
	for (const target of [
		...Object.values(input.partTargets),
		...Object.values(input.classTargets ?? {}),
	])
		validateAllocationTarget(target);
	if (
		!approxEqual(
			Object.values(input.partTargets).reduce((sum, target) => sum + target.target, 0),
			1,
		)
	)
		throw new Error("Os alvos das partes devem somar 1.");
}
function prepareAllocation(input: PartContributionInput): EngineInput {
	validateAllocationTargets(input);
	const values = new Map<string, number>();
	const targets: Candidate["targets"] = [];
	const limits: Bucket[] = [];
	const candidates: Candidate[] = [];
	let total = 0;
	nonNegative(input.minOperationValue, "minOperationValue");
	for (const [part, target] of Object.entries(input.partTargets)) {
		targets.push({ key: `part:${part}`, value: target.target, band: target.band });
	}
	for (const [label, target] of Object.entries(input.classTargets ?? {})) {
		targets.push({ key: classKey(label), value: target.target, band: target.band });
	}
	for (const position of input.positions) {
		nonNegative(position.value, "position.value");
		total += position.value;
		for (const key of [
			assetKey(position.assetId),
			partKey(position.part),
			classKey(position.assetClass),
			institutionKey(position.institution),
			...(position.issuer?.trim() ? [`issuer:${position.issuer.trim()}`] : []),
			segmentKey(position.segment),
		])
			add(values, key, position.value);
	}
	for (const candidate of input.candidates) {
		candidates.push({
			input: candidate,
			buckets: [
				assetKey(candidate.assetId),
				partKey(candidate.part),
				classKey(candidate.assetClass),
				institutionKey(candidate.institution),
				...(candidate.issuer?.trim() ? [`issuer:${candidate.issuer.trim()}`] : []),
				segmentKey(candidate.segment),
			],
			targets: targets.filter(
				(target) =>
					target.key === partKey(candidate.part) || target.key === classKey(candidate.assetClass),
			),
			required: ["price", "part"],
			concentration: candidate.concentration,
			quantity: 0,
			invested: 0,
		});
	}
	const all = [...input.positions, ...input.candidates];
	if (
		input.concentrationLimits?.perIssuer !== undefined &&
		all.some((position) => !position.issuer?.trim())
	)
		throw new Error("Emissor necessário para verificar limite por emissor.");
	for (const [field, prefix, labels] of [
		[
			input.concentrationLimits?.perIssuer,
			"issuer",
			all.flatMap((position) => (position.issuer?.trim() ? [position.issuer.trim()] : [])),
		],
		[input.concentrationLimits?.perAsset, "asset", all.map((position) => position.assetId)],
		[input.concentrationLimits?.perClass, "class", all.map((position) => position.assetClass)],
		[
			input.concentrationLimits?.perInstitution,
			"institution",
			all.map((position) => position.institution),
		],
	] satisfies [number | undefined, string, string[]][]) {
		if (field !== undefined) {
			fraction(field, prefix);
			for (const label of new Set(labels)) limits.push({ key: `${prefix}:${label}`, value: field });
		}
	}
	const minLiquidity = input.minDailyLiquidity;
	const maxConcentration = input.maxConcentration;
	if (minLiquidity !== undefined) nonNegative(minLiquidity, "minDailyLiquidity");
	if (maxConcentration !== undefined) fraction(maxConcentration, "maxConcentration");
	return {
		contribution: input.contributionAmount,
		allowed: input.allowedAssetIds,
		values,
		total,
		candidates,
		limits,
		minLiquidity,
		maxConcentration,
		minimum: input.minOperationValue,
	};
}

function selectEligibleCandidates(
	engine: EngineInput,
	findings: SimulationAuditFinding[],
): Candidate[] {
	return engine.candidates.filter((candidate) => {
		const candidateInput = candidate.input;
		const start = findings.length;
		const block = (
			code: SimulationAuditFinding["code"],
			message: string,
			metric?: ContributionCandidateMetric,
		) =>
			findings.push({
				code,
				severity: "blocked",
				ticker: candidateInput.ticker,
				message: `${candidateInput.ticker}: ${message}`,
				metric,
			});
		nonNegative(candidateInput.currentPrice, "currentPrice");
		if (candidateInput.currentPrice === 0)
			throw new Error("currentPrice: informe um valor positivo.");
		if (!Number.isSafeInteger(candidateInput.lotSize ?? 1) || (candidateInput.lotSize ?? 1) <= 0)
			throw new Error("lotSize: informe um inteiro positivo.");
		if (candidateInput.priority !== undefined) nonNegative(candidateInput.priority, "priority");
		if (candidateInput.maxPrice !== undefined) nonNegative(candidateInput.maxPrice, "maxPrice");
		if (candidateInput.estimatedMonthlyDividendPerUnit !== undefined)
			nonNegative(
				candidateInput.estimatedMonthlyDividendPerUnit,
				"estimatedMonthlyDividendPerUnit",
			);
		if (candidateInput.dailyLiquidity !== undefined)
			nonNegative(candidateInput.dailyLiquidity, "dailyLiquidity");
		if (candidate.concentration !== undefined) fraction(candidate.concentration, "concentration");
		if (!engine.allowed.includes(candidateInput.assetId))
			block("candidate_outside_universe", "fora do universo permitido nesta simulação.");
		const required = [...candidate.required];
		if (candidateInput.lotSize !== undefined) required.push("lotSize");
		if (engine.minLiquidity !== undefined) required.push("dailyLiquidity");
		if (engine.maxConcentration !== undefined) required.push("concentration");
		for (const metric of required)
			if (
				!candidateInput.metricSourceRefs.some(
					(sourceRef) => sourceRef.metric === metric && sourceRef.label.trim(),
				)
			)
				block("missing_metric_source", `fonte ausente para ${metric}.`, metric);
		if (
			candidateInput.maxPrice !== undefined &&
			candidateInput.currentPrice > candidateInput.maxPrice
		)
			block("price_above_limit", "preço acima do limite da simulação.");
		if (engine.minLiquidity !== undefined) {
			if (candidateInput.dailyLiquidity === undefined)
				block("missing_metric", "liquidez ausente; revisão necessária.", "dailyLiquidity");
			else if (candidateInput.dailyLiquidity < engine.minLiquidity)
				block("liquidity_below_minimum", "liquidez abaixo do mínimo da simulação.");
		}
		if (engine.maxConcentration !== undefined) {
			if (candidate.concentration === undefined)
				block("missing_metric", "concentração ausente; revisão necessária.", "concentration");
			else if (candidate.concentration > engine.maxConcentration)
				block("concentration_above_limit", "concentração acima do limite da simulação.");
		}
		return findings.length === start;
	});
}

function allocateWholeLots(
	engine: EngineInput,
	eligible: Candidate[],
	findings: SimulationAuditFinding[],
	finalTotal: number,
): number {
	let remainingCash = engine.contribution;
	const limitRecorded = new Set<string>();
	while (remainingCash > 0) {
		const options = eligible
			.flatMap((candidate) => {
				const lot = candidate.input.lotSize ?? 1;
				// O primeiro bloco reúne lotes inteiros suficientes para o mínimo por operação.
				const quantity =
					candidate.quantity === 0
						? lot * Math.max(1, Math.ceil(engine.minimum / (lot * candidate.input.currentPrice)))
						: lot;
				const value = quantity * candidate.input.currentPrice;
				if (
					!Number.isSafeInteger(quantity) ||
					value <= 0 ||
					(value > remainingCash && !approxEqual(value, remainingCash))
				)
					return [];
				if (
					engine.limits.some(
						(limit) =>
							candidate.buckets.includes(limit.key) &&
							((engine.values.get(limit.key) ?? 0) + value) / finalTotal > limit.value &&
							!approxEqual(((engine.values.get(limit.key) ?? 0) + value) / finalTotal, limit.value),
					)
				) {
					if (!limitRecorded.has(candidate.input.assetId)) {
						limitRecorded.add(candidate.input.assetId);
						findings.push({
							code: "allocation_limit_reached",
							severity: "info",
							ticker: candidate.input.ticker,
							message: `${candidate.input.ticker}: limite de alocação impede outro lote simulado.`,
						});
					}
					return [];
				}
				// Uma dimensão abaixo da faixa pode convergir; não pode ultrapassar a faixa
				// nem piorar o desvio em nenhuma dimensão tocada pelo lote.
				if (
					candidate.targets.some((target) => {
						const current = (engine.values.get(target.key) ?? 0) / finalTotal;
						const after = current + value / finalTotal;
						return (
							(after > target.band.max && !approxEqual(after, target.band.max)) ||
							(Math.abs(after - target.value) > Math.abs(current - target.value) &&
								!approxEqual(Math.abs(after - target.value), Math.abs(current - target.value)))
						);
					})
				)
					return [];
				const improvement = candidate.targets.reduce((sum, target) => {
					const current = (engine.values.get(target.key) ?? 0) / finalTotal;
					return (
						sum +
						Math.abs(target.value - current) -
						Math.abs(target.value - current - value / finalTotal)
					);
				}, 0);
				if (candidate.targets.length && improvement <= 0) return [];
				return [{ candidate, quantity, value, improvement }];
			})
			.sort(
				(left, right) =>
					right.improvement - left.improvement ||
					(left.candidate.input.priority ?? 1000) - (right.candidate.input.priority ?? 1000) ||
					right.value - left.value ||
					left.candidate.input.ticker.localeCompare(right.candidate.input.ticker) ||
					left.candidate.input.assetId.localeCompare(right.candidate.input.assetId),
			);
		const next = options[0];
		if (!next) break;
		next.candidate.quantity += next.quantity;
		next.candidate.invested += next.value;
		const updated = remainingCash - next.value;
		if (updated === remainingCash)
			throw new Error("Lote abaixo da precisão numérica do orçamento.");
		// Lote que esgota o orçamento deixa só resíduo de ponto flutuante, não caixa.
		remainingCash =
			updated < 0 || approxEqual(updated, 0, { absolute: engine.contribution * 1e-12 })
				? 0
				: updated;
		for (const key of next.candidate.buckets) add(engine.values, key, next.value);
	}
	return remainingCash;
}

/** Cenário de lotes inteiros com pesos e limites em frações decimais. */
export function simulateContributionAllocation(
	input: PartContributionInput,
): AuditableContributionSimulation {
	const engine = prepareAllocation(input);
	nonNegative(engine.contribution, "contributionAmount");
	if (
		new Set(engine.allowed).size !== engine.allowed.length ||
		engine.allowed.some((assetId) => !assetId.trim())
	)
		throw new Error("Universo permitido inválido.");
	if (
		new Set(engine.candidates.map((candidate) => candidate.input.assetId)).size !==
		engine.candidates.length
	)
		throw new Error("Candidatos duplicados.");
	const finalTotal = engine.total + engine.contribution;
	if (!Number.isFinite(finalTotal)) throw new Error("Total fora do intervalo finito.");
	const findings: SimulationAuditFinding[] = [];
	const eligible = selectEligibleCandidates(engine, findings);
	const remainingCash = allocateWholeLots(engine, eligible, findings, finalTotal);
	if (remainingCash > 0)
		findings.push({
			code: "cash_unallocated",
			severity: "info",
			message: "Caixa não alocado: nenhum lote válido restante na simulação do plano de operação.",
		});

	add(engine.values, "segment:cash", remainingCash);
	const weight = (key: string) =>
		finalTotal === 0 ? 0 : (engine.values.get(key) ?? 0) / finalTotal;
	const record = (prefix: string) =>
		Object.fromEntries(
			[...engine.values]
				.filter(([key]) => key.startsWith(prefix))
				.map(([key]) => [key.slice(prefix.length), weight(key)]),
		);
	return {
		contributionAmount: engine.contribution,
		investedAmount: engine.contribution - remainingCash,
		remainingCash,
		planItems: eligible
			.filter((candidate) => candidate.quantity > 0)
			.sort(
				(left, right) =>
					(left.input.priority ?? 1000) - (right.input.priority ?? 1000) ||
					left.input.ticker.localeCompare(right.input.ticker),
			)
			.map((candidate) => ({
				assetId: candidate.input.assetId,
				ticker: candidate.input.ticker,
				quantity: candidate.quantity,
				referencePrice: candidate.input.currentPrice,
				estimatedValue: candidate.invested,
				estimatedMonthlyDividend:
					candidate.input.estimatedMonthlyDividendPerUnit === undefined
						? undefined
						: candidate.quantity * candidate.input.estimatedMonthlyDividendPerUnit,
				metricSourceRefs: candidate.input.metricSourceRefs,
			})),
		auditFindings: findings,
		postAllocation: {
			totalValue: finalTotal,
			byAsset: record("asset:"),
			byClass: record("class:"),
			byInstitution: record("institution:"),
			byIssuer: record("issuer:"),
			cash: weight("segment:cash"),
			bySegment: record("segment:"),
			byPart: {
				reserve: weight("part:reserve"),
				goal: weight("part:goal"),
				variableIncome: weight("part:variableIncome"),
			},
		},
	} satisfies AuditableContributionSimulation;
}
