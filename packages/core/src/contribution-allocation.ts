import type {
	PortfolioCashAccountInput,
	PortfolioPositionInput,
	RiskCategory,
} from "@decision-board/types";
import type { PortfolioPart } from "./units.js";

export type ContributionCandidateMetric =
	| "price"
	| "lotSize"
	| "targetWeightPercent"
	| "riskCategory"
	| "part"
	| "segment"
	| "dailyLiquidity"
	| "concentrationPercent";
export interface MetricSourceRef {
	metric: ContributionCandidateMetric;
	label: string;
	url?: string;
	capturedAt?: string;
}
export interface ContributionCandidateInput {
	assetId: string;
	ticker: string;
	currentPrice: number;
	riskCategory: RiskCategory;
	segment?: string;
	targetWeightPercent?: number;
	maxPrice?: number;
	lotSize?: number;
	priority?: number;
	dailyLiquidity?: number;
	concentrationPercent?: number;
	estimatedMonthlyDividendPerUnit?: number;
	metricSourceRefs: MetricSourceRef[];
}
export interface ContributionAllocationConstraints {
	maxSingleAssetPercent?: number;
	maxSegmentPercent?: number;
	maxRiskCategoryPercent?: Partial<Record<RiskCategory, number>>;
	minDailyLiquidity?: number;
	maxConcentrationPercent?: number;
}
export interface ContributionAllocationInput {
	positions: PortfolioPositionInput[];
	cashAccounts?: PortfolioCashAccountInput[];
	contributionAmount: number;
	allowedAssetIds: string[];
	candidates: ContributionCandidateInput[];
	constraints?: ContributionAllocationConstraints;
}
export interface AllocationHolding {
	assetId: string;
	part: PortfolioPart;
	value: number;
	assetClass: string;
	institution: string;
	segment?: string;
}
export interface PartContributionCandidate
	extends Omit<
		ContributionCandidateInput,
		"riskCategory" | "targetWeightPercent" | "concentrationPercent"
	> {
	part: PortfolioPart;
	assetClass: string;
	institution: string;
	concentration?: number;
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
	concentrationLimits?: { perAsset?: number; perClass?: number; perInstitution?: number };
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
		byAsset: Record<string, number>;
		byPart: Partial<Record<PortfolioPart, number>>;
		byRiskCategory: Record<RiskCategory, number>;
		bySegment: Record<string, number>;
	};
}
interface Bucket {
	key: string;
	value: number;
}
interface Candidate {
	input: Omit<ContributionCandidateInput, "riskCategory">;
	buckets: string[];
	targets: Bucket[];
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
	targets: Bucket[];
	limits: Bucket[];
	minLiquidity: number | undefined;
	maxConcentration: number | undefined;
	minimum: number;
	legacy: boolean;
}

const assetKey = (id: string) => `asset:${id}`;
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
function normalize(input: ContributionAllocationInput | PartContributionInput): EngineInput {
	const values = new Map<string, number>();
	const targets: Bucket[] = [];
	const limits: Bucket[] = [];
	const candidates: Candidate[] = [];
	let total = 0;
	const isPart = "partTargets" in input;
	if (isPart) {
		nonNegative(input.minOperationValue, "minOperationValue");
		for (const [part, target] of Object.entries(input.partTargets)) {
			validateAllocationTarget(target);
			targets.push({ key: `part:${part}`, value: target.target });
		}
		if (Math.abs(targets.reduce((sum, t) => sum + t.value, 0) - 1) > 1e-12)
			throw new Error("Os alvos das partes devem somar 1.");
		for (const [label, target] of Object.entries(input.classTargets ?? {})) {
			validateAllocationTarget(target);
			targets.push({ key: classKey(label), value: target.target });
		}
		for (const p of input.positions) {
			nonNegative(p.value, "position.value");
			total += p.value;
			for (const key of [
				assetKey(p.assetId),
				partKey(p.part),
				classKey(p.assetClass),
				institutionKey(p.institution),
				segmentKey(p.segment),
			])
				add(values, key, p.value);
		}
		for (const c of input.candidates) {
			candidates.push({
				input: c,
				buckets: [
					assetKey(c.assetId),
					partKey(c.part),
					classKey(c.assetClass),
					institutionKey(c.institution),
					segmentKey(c.segment),
				],
				targets: targets.filter(
					(t) => t.key === partKey(c.part) || t.key === classKey(c.assetClass),
				),
				required: ["price", "part"],
				concentration: c.concentration,
				quantity: 0,
				invested: 0,
			});
		}
		const all = [...input.positions, ...input.candidates];
		for (const [field, prefix, labels] of [
			[input.concentrationLimits?.perAsset, "asset", all.map((p) => p.assetId)],
			[input.concentrationLimits?.perClass, "class", all.map((p) => p.assetClass)],
			[input.concentrationLimits?.perInstitution, "institution", all.map((p) => p.institution)],
		] satisfies [number | undefined, string, string[]][]) {
			if (field !== undefined) {
				fraction(field, prefix);
				for (const label of new Set(labels))
					limits.push({ key: `${prefix}:${label}`, value: field });
			}
		}
	} else {
		for (const p of input.positions) {
			nonNegative(p.quantity, "quantity");
			nonNegative(p.currentPrice, "currentPrice");
			const value = p.quantity * p.currentPrice;
			total += value;
			for (const key of [assetKey(p.assetId), `risk:${p.riskCategory}`, segmentKey(p.segment)])
				add(values, key, value);
		}
		for (const c of input.cashAccounts ?? []) {
			nonNegative(c.balance, "balance");
			total += c.balance;
			add(values, "risk:cash", c.balance);
			add(values, "segment:cash", c.balance);
		}
		for (const c of input.candidates) {
			const ct =
				c.targetWeightPercent === undefined
					? []
					: [{ key: assetKey(c.assetId), value: c.targetWeightPercent / 100 }];
			candidates.push({
				input: c,
				buckets: [assetKey(c.assetId), `risk:${c.riskCategory}`, segmentKey(c.segment)],
				targets: ct,
				required: ["price"],
				concentration:
					c.concentrationPercent === undefined ? undefined : c.concentrationPercent / 100,
				quantity: 0,
				invested: 0,
			});
			const constraints = input.constraints;
			for (const [key, value] of [
				[assetKey(c.assetId), constraints?.maxSingleAssetPercent],
				[segmentKey(c.segment), constraints?.maxSegmentPercent],
				[`risk:${c.riskCategory}`, constraints?.maxRiskCategoryPercent?.[c.riskCategory]],
			] satisfies [string, number | undefined][]) {
				if (value !== undefined) {
					fraction(value / 100, key);
					limits.push({ key, value: value / 100 });
				}
			}
			if (c.targetWeightPercent !== undefined) {
				fraction(c.targetWeightPercent / 100, "targetWeightPercent");
				candidates.at(-1)?.required.push("targetWeightPercent");
			}
			if (constraints?.maxRiskCategoryPercent) candidates.at(-1)?.required.push("riskCategory");
			if (constraints?.maxSegmentPercent !== undefined) candidates.at(-1)?.required.push("segment");
		}
	}
	const minLiquidity = isPart ? input.minDailyLiquidity : input.constraints?.minDailyLiquidity;
	const maxConcentration = isPart
		? input.maxConcentration
		: input.constraints?.maxConcentrationPercent === undefined
			? undefined
			: input.constraints.maxConcentrationPercent / 100;
	if (minLiquidity !== undefined) nonNegative(minLiquidity, "minDailyLiquidity");
	if (maxConcentration !== undefined) fraction(maxConcentration, "maxConcentration");
	return {
		contribution: input.contributionAmount,
		allowed: input.allowedAssetIds,
		values,
		total,
		candidates,
		targets,
		limits,
		minLiquidity,
		maxConcentration,
		minimum: isPart ? input.minOperationValue : 0,
		legacy: !isPart,
	};
}

/** Um único alocador de lotes; pontos percentuais legados são convertidos só na fronteira. */
export function simulateContributionAllocation(
	input: ContributionAllocationInput | PartContributionInput,
): AuditableContributionSimulation {
	const e = normalize(input);
	nonNegative(e.contribution, "contributionAmount");
	if (e.legacy && e.contribution === 0)
		throw new Error("contributionAmount: informe um valor positivo.");
	if (new Set(e.allowed).size !== e.allowed.length || e.allowed.some((id) => !id.trim()))
		throw new Error("Universo permitido inválido.");
	if (new Set(e.candidates.map((c) => c.input.assetId)).size !== e.candidates.length)
		throw new Error("Candidatos duplicados.");
	const finalTotal = e.total + e.contribution;
	if (!Number.isFinite(finalTotal)) throw new Error("Total fora do intervalo finito.");
	const findings: SimulationAuditFinding[] = [];
	const eligible = e.candidates.filter((c) => {
		const x = c.input;
		const start = findings.length;
		const block = (
			code: SimulationAuditFinding["code"],
			message: string,
			metric?: ContributionCandidateMetric,
		) =>
			findings.push({
				code,
				severity: "blocked",
				ticker: x.ticker,
				message: `${x.ticker}: ${message}`,
				metric,
			});
		nonNegative(x.currentPrice, "currentPrice");
		if (x.currentPrice === 0) throw new Error("currentPrice: informe um valor positivo.");
		if (!Number.isSafeInteger(x.lotSize ?? 1) || (x.lotSize ?? 1) <= 0)
			throw new Error("lotSize: informe um inteiro positivo.");
		if (x.priority !== undefined) nonNegative(x.priority, "priority");
		if (x.maxPrice !== undefined) nonNegative(x.maxPrice, "maxPrice");
		if (x.estimatedMonthlyDividendPerUnit !== undefined)
			nonNegative(x.estimatedMonthlyDividendPerUnit, "estimatedMonthlyDividendPerUnit");
		if (x.dailyLiquidity !== undefined) nonNegative(x.dailyLiquidity, "dailyLiquidity");
		if (c.concentration !== undefined) fraction(c.concentration, "concentration");
		if (!e.allowed.includes(x.assetId))
			block("candidate_outside_universe", "fora do universo permitido nesta simulação.");
		const required = [...c.required];
		if (x.lotSize !== undefined) required.push("lotSize");
		if (e.minLiquidity !== undefined) required.push("dailyLiquidity");
		if (e.maxConcentration !== undefined) required.push("concentrationPercent");
		for (const metric of required)
			if (!x.metricSourceRefs.some((s) => s.metric === metric && s.label.trim()))
				block("missing_metric_source", `fonte ausente para ${metric}.`, metric);
		if (x.maxPrice !== undefined && x.currentPrice > x.maxPrice)
			block("price_above_limit", "preço acima do limite da simulação.");
		if (e.minLiquidity !== undefined) {
			if (x.dailyLiquidity === undefined)
				block("missing_metric", "liquidez ausente; revisão necessária.", "dailyLiquidity");
			else if (x.dailyLiquidity < e.minLiquidity)
				block("liquidity_below_minimum", "liquidez abaixo do mínimo da simulação.");
		}
		if (e.maxConcentration !== undefined) {
			if (c.concentration === undefined)
				block(
					"missing_metric",
					"concentração ausente; revisão necessária.",
					"concentrationPercent",
				);
			else if (c.concentration > e.maxConcentration)
				block("concentration_above_limit", "concentração acima do limite da simulação.");
		}
		return findings.length === start;
	});
	let remainingCash = e.contribution;
	const limitRecorded = new Set<string>();
	while (remainingCash > 0) {
		const options = eligible
			.flatMap((c) => {
				const lot = c.input.lotSize ?? 1;
				// O primeiro bloco reúne lotes inteiros suficientes para o mínimo por operação.
				const quantity =
					c.quantity === 0
						? lot * Math.max(1, Math.ceil(e.minimum / (lot * c.input.currentPrice)))
						: lot;
				const value = quantity * c.input.currentPrice;
				if (!Number.isSafeInteger(quantity) || value > remainingCash || value <= 0) return [];
				if (
					e.limits.some(
						(l) =>
							c.buckets.includes(l.key) &&
							((e.values.get(l.key) ?? 0) + value) / finalTotal > l.value,
					)
				) {
					if (!limitRecorded.has(c.input.assetId)) {
						limitRecorded.add(c.input.assetId);
						findings.push({
							code: "allocation_limit_reached",
							severity: "blocked",
							ticker: c.input.ticker,
							message: `${c.input.ticker}: limite de alocação impede outro lote simulado.`,
						});
					}
					return [];
				}
				const improvement = c.targets.reduce((sum, t) => {
					const current = (e.values.get(t.key) ?? 0) / finalTotal;
					return (
						sum + Math.abs(t.value - current) - Math.abs(t.value - current - value / finalTotal)
					);
				}, 0);
				if (c.targets.length && improvement <= 0) return [];
				return [{ c, quantity, value, improvement }];
			})
			.sort(
				(a, b) =>
					b.improvement - a.improvement ||
					(a.c.input.priority ?? 1000) - (b.c.input.priority ?? 1000) ||
					b.value - a.value ||
					a.c.input.ticker.localeCompare(b.c.input.ticker) ||
					a.c.input.assetId.localeCompare(b.c.input.assetId),
			);
		const next = options[0];
		if (!next) break;
		next.c.quantity += next.quantity;
		next.c.invested += next.value;
		const updated = remainingCash - next.value;
		if (updated === remainingCash)
			throw new Error("Lote abaixo da precisão numérica do orçamento.");
		remainingCash = updated;
		for (const key of next.c.buckets) add(e.values, key, next.value);
	}
	if (remainingCash > 0)
		findings.push({
			code: "cash_unallocated",
			severity: "info",
			message: "Caixa não alocado: nenhum lote válido restante na simulação do plano de operação.",
		});
	add(e.values, "risk:cash", remainingCash);
	add(e.values, "segment:cash", remainingCash);
	const weight = (key: string) => (finalTotal === 0 ? 0 : (e.values.get(key) ?? 0) / finalTotal);
	const record = (prefix: string) =>
		Object.fromEntries(
			[...e.values]
				.filter(([key]) => key.startsWith(prefix))
				.map(([key]) => [
					key.slice(prefix.length),
					e.legacy ? Math.round(weight(key) * 10000) / 100 : weight(key),
				]),
		);
	return {
		contributionAmount: e.contribution,
		investedAmount: e.contribution - remainingCash,
		remainingCash,
		planItems: eligible
			.filter((c) => c.quantity > 0)
			.sort(
				(a, b) =>
					(a.input.priority ?? 1000) - (b.input.priority ?? 1000) ||
					a.input.ticker.localeCompare(b.input.ticker),
			)
			.map((c) => ({
				assetId: c.input.assetId,
				ticker: c.input.ticker,
				quantity: c.quantity,
				referencePrice: c.input.currentPrice,
				estimatedValue: c.invested,
				estimatedMonthlyDividend:
					c.input.estimatedMonthlyDividendPerUnit === undefined
						? undefined
						: c.quantity * c.input.estimatedMonthlyDividendPerUnit,
				metricSourceRefs: c.input.metricSourceRefs,
			})),
		auditFindings: findings,
		postAllocation: {
			totalValue: finalTotal,
			byAsset: record("asset:"),
			bySegment: record("segment:"),
			byPart: {
				reserve: weight("part:reserve"),
				goal: weight("part:goal"),
				equities: weight("part:equities"),
			},
			byRiskCategory: {
				brick: record("risk:").brick ?? 0,
				paper: record("risk:").paper ?? 0,
				hybrid: record("risk:").hybrid ?? 0,
				cash: record("risk:").cash ?? 0,
				other: record("risk:").other ?? 0,
			},
		},
	} satisfies AuditableContributionSimulation;
}
