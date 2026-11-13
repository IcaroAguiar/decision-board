import { type AnalysisFinding, createAnalysisResult, methodIds } from "../analysis.js";
import {
	type AllocationHolding,
	type PartContributionInput,
	simulateContributionAllocation,
	validateAllocationTarget,
} from "../contribution-allocation.js";
import {
	assessFreshness,
	collectEvidence,
	type Datum,
	sumWithCoverage,
	weightsWithCoverage,
} from "../provenance.js";
import { approxEqual, portfolioParts } from "../units.js";

export interface AllocationPosition extends Omit<AllocationHolding, "value"> {
	value: Datum<number>;
	subclass?: string;
	custody: "b3" | "outside-b3";
}
export interface AllocationVsTargetInput extends Omit<PartContributionInput, "positions"> {
	positions: AllocationPosition[];
	allowSales: boolean;
	strategyVersion: string;
	asOf: string;
	freshnessLimitDays?: number;
}
export function analyzeAllocationVsTarget(input: AllocationVsTargetInput) {
	const evidence = collectEvidence(input.positions.map((position) => position.value));
	const notVerified = [
		...evidence.notVerified,
		"Viabilidade operacional e custos (R10) não verificados.",
	];
	if (input.allowSales) notVerified.push("Venda não simulada nesta versão");
	for (const position of input.positions) {
		if (!position.segment?.trim())
			notVerified.push(`Ativo sem classificação de setor: ${position.assetId}`);
		if (
			position.custody === "outside-b3" &&
			assessFreshness(position.value, input.asOf, input.freshnessLimitDays ?? 30).state === "stale"
		)
			notVerified.push(`Posição fora da B3 desatualizada: ${position.assetId}`);
	}
	// Pesos se referem somente ao patrimônio conhecido quando a cobertura é parcial.
	const coverage = weightsWithCoverage(
		input.positions.map((position, positionIndex) => ({
			key: `${position.assetId}:${positionIndex}`,
			value: position.value,
		})),
	);
	const total = sumWithCoverage(input.positions.map((position) => position.value)).total;
	const holdings: AllocationHolding[] = input.positions.flatMap((position) =>
		position.value.status === "known" ? [{ ...position, value: position.value.value }] : [],
	);
	const knownValues = (predicate: (position: AllocationHolding) => boolean) =>
		holdings.filter(predicate).reduce((sum, position) => sum + position.value, 0);
	const weight = (value: number) => (total > 0 ? value / total : null);
	const findings: AnalysisFinding[] = [];
	const deviation = (
		key: string,
		value: number | null,
		target: PartContributionInput["partTargets"]["goal"],
	) => {
		validateAllocationTarget(target);
		if (
			value !== null &&
			((value < target.band.min && !approxEqual(value, target.band.min)) ||
				(value > target.band.max && !approxEqual(value, target.band.max)))
		)
			findings.push({
				code: "allocation_out_of_band",
				severity: "warning",
				subject: key,
				message: `Alerta: ${key} fora da faixa da estratégia; revisão necessária.`,
			});
		return {
			key,
			currentWeight: value,
			target: target.target,
			deviation: value === null ? null : value - target.target,
		};
	};
	const byPart = portfolioParts.map((part) =>
		deviation(
			part,
			weight(knownValues((position) => position.part === part)),
			input.partTargets[part],
		),
	);
	const byClass = Object.entries(input.classTargets ?? {}).map(([label, target]) =>
		deviation(label, weight(knownValues((position) => position.assetClass === label)), target),
	);
	for (const [dimension, limit, labelOf] of [
		[
			"asset",
			input.concentrationLimits?.perAsset,
			(position: AllocationHolding) => position.assetId,
		],
		[
			"class",
			input.concentrationLimits?.perClass,
			(position: AllocationHolding) => position.assetClass,
		],
		[
			"institution",
			input.concentrationLimits?.perInstitution,
			(position: AllocationHolding) => position.institution,
		],
	] satisfies [string, number | undefined, (position: AllocationHolding) => string][]) {
		if (limit === undefined) continue;
		if (!Number.isFinite(limit) || limit < 0 || limit > 1)
			throw new Error("Limite de concentração inválido.");
		for (const label of new Set(holdings.map(labelOf))) {
			const current = weight(knownValues((position) => labelOf(position) === label));
			if (current !== null && current > limit && !approxEqual(current, limit))
				findings.push({
					code: `concentration_${dimension}`,
					severity: "warning",
					subject: label,
					message: `Alerta de concentração em ${label}; revisão necessária.`,
				});
		}
	}
	for (const position of [...holdings, ...input.candidates]) {
		const sameAsset = [...holdings, ...input.candidates].filter(
			(other) => other.assetId === position.assetId,
		);
		if (
			sameAsset.some(
				(other) =>
					other.part !== position.part ||
					other.assetClass !== position.assetClass ||
					other.institution !== position.institution ||
					other.segment !== position.segment,
			)
		)
			throw new Error("Classificações inconsistentes para o mesmo ativo.");
	}
	const missingPositions = input.positions
		.filter((position) => position.value.status === "missing")
		.map((position) => position.assetId);
	let proposal = null;
	if (missingPositions.length === 0) {
		proposal = simulateContributionAllocation({ ...input, positions: holdings });
		findings.push(
			...proposal.auditFindings.map((finding) => ({
				code: finding.code,
				severity: finding.severity,
				subject: finding.ticker,
				message: finding.message,
			})),
		);
	} else {
		notVerified.push(
			`Proposta não calculada: valor ausente nas posições ${missingPositions.join(", ")}.`,
		);
	}
	if (coverage.coverage === "empty")
		notVerified.push("Pesos indefinidos: patrimônio conhecido nulo ou ausente.");
	const maxDeviationBefore =
		total > 0 ? Math.max(...byPart.map((row) => Math.abs(row.deviation ?? 0))) : null;
	const maxDeviationAfter =
		proposal && proposal.postAllocation.totalValue > 0
			? Math.max(
					...portfolioParts.map((part) =>
						Math.abs((proposal.postAllocation.byPart[part] ?? 0) - input.partTargets[part].target),
					),
				)
			: null;
	return createAnalysisResult({
		method: { id: methodIds.allocationVsTarget, version: "1.0.0" },
		strategyVersion: input.strategyVersion,
		asOf: input.asOf,
		inputs: input,
		assumptions: {
			weights: "Fração do patrimônio conhecido; caixa do aporte integra o denominador final.",
			freshnessLimitDays: input.freshnessLimitDays ?? 30,
			allowSales: input.allowSales,
		},
		sources: evidence.sources,
		notVerified,
		findings,
		status:
			missingPositions.length > 0 ||
			coverage.coverage === "empty" ||
			findings.some((finding) => finding.severity === "blocked")
				? "partial"
				: "complete",
		output: {
			byPart,
			byClass,
			coverage: coverage.coverage,
			missingPositions,
			proposal,
			maxDeviationBefore,
			maxDeviationAfter,
		},
	});
}
