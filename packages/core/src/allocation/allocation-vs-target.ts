import {
	type AnalysisFinding,
	createAnalysisResult,
	methodIds,
	statusFromCoverage,
} from "../analysis.js";
import {
	type AllocationHolding,
	type PartContributionInput,
	simulateContributionAllocation,
	validateAllocationTarget,
	validateAllocationTargets,
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
	validateAllocationTargets(input);
	const evidence = collectEvidence(input.positions.map((position) => position.value));
	const notVerified = [
		...evidence.notVerified,
		"Viabilidade operacional e custos (R10) não verificados.",
	];
	if (input.allowSales) notVerified.push("Venda não simulada nesta versão");
	for (const position of [...input.positions, ...input.candidates]) {
		if (input.concentrationLimits?.perIssuer !== undefined && !position.issuer?.trim())
			notVerified.push(`Emissor não informado: ${position.assetId}`);
		if (
			"custody" in position &&
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
	const weight = (value: number) => (total !== null && total > 0 ? value / total : null);
	const findings: AnalysisFinding[] = [];
	const scope = coverage.coverage === "partial" ? " sobre o patrimônio conhecido" : "";
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
				message: `Alerta: ${key} fora da faixa da estratégia${scope}; revisão necessária.`,
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
			"issuer",
			input.concentrationLimits?.perIssuer,
			(position: AllocationHolding) => position.issuer?.trim() ?? "",
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
			if (!label) continue;
			const current = weight(knownValues((position) => labelOf(position) === label));
			if (current !== null && current > limit && !approxEqual(current, limit))
				findings.push({
					code: `concentration_${dimension}`,
					severity: "warning",
					subject: label,
					message: `Alerta de concentração em ${label}${scope}; revisão necessária.`,
				});
		}
	}
	const classifications = [...input.positions, ...input.candidates];
	const segments = new Map<string, string>();
	for (const assetId of new Set(classifications.map((position) => position.assetId))) {
		const sameAsset = classifications.filter((other) => other.assetId === assetId);
		const position = sameAsset[0];
		if (!position) continue;
		if (
			sameAsset.some(
				(other) => other.part !== position.part || other.assetClass !== position.assetClass,
			)
		)
			throw new Error("Classificações inconsistentes para o mesmo ativo.");
		const labels = [
			...new Set(
				sameAsset.flatMap((other) => (other.segment?.trim() ? [other.segment.trim()] : [])),
			),
		];
		if (labels.length > 1) notVerified.push(`Setores conflitantes para o ativo: ${assetId}`);
		else if (labels[0]) segments.set(assetId, labels[0]);
		else notVerified.push(`Ativo sem classificação de setor: ${assetId}`);
	}
	const normalizedHoldings = holdings.map((position) => ({
		...position,
		segment: segments.get(position.assetId) ?? position.segment,
	}));
	const missingPositions = input.positions
		.filter((position) => position.value.status === "missing")
		.map((position) => position.assetId);
	let proposal = null;
	if (
		missingPositions.length === 0 &&
		coverage.coverage !== "empty" &&
		!(
			input.concentrationLimits?.perIssuer !== undefined &&
			classifications.some((position) => !position.issuer?.trim())
		)
	) {
		proposal = simulateContributionAllocation({
			...input,
			positions: normalizedHoldings,
			candidates: input.candidates.map((candidate) => ({
				...candidate,
				segment: segments.get(candidate.assetId) ?? candidate.segment,
			})),
		});
		findings.push(
			...proposal.auditFindings.map((finding) => ({
				code: finding.code,
				severity: finding.severity,
				subject: finding.ticker,
				message: finding.message,
			})),
		);
	} else if (missingPositions.length > 0) {
		notVerified.push(
			`Proposta não calculada: valor ausente nas posições ${missingPositions.join(", ")}.`,
		);
	}
	if (coverage.coverage === "empty")
		notVerified.push("Pesos indefinidos: patrimônio conhecido nulo ou ausente.");
	// Antes e depois usam patrimônio conhecido + aporte; caixa ainda não alocado permanece no total.
	const denominator = total === null ? null : total + input.contributionAmount;
	const afterRows = (rows: typeof byPart, weights: Record<string, number> | undefined) =>
		rows.map((row) => ({
			...row,
			weightAfter: weights ? (weights[row.key] ?? 0) : null,
			deviationAfter: weights ? (weights[row.key] ?? 0) - row.target : null,
		}));
	const parts = afterRows(byPart, proposal?.postAllocation.byPart);
	const classes = afterRows(byClass, proposal?.postAllocation.byClass);
	const maxDeviationBefore =
		denominator !== null && denominator > 0
			? Math.max(
					...portfolioParts.map((part) =>
						Math.abs(
							knownValues((position) => position.part === part) / denominator -
								input.partTargets[part].target,
						),
					),
					...Object.entries(input.classTargets ?? {}).map(([label, target]) =>
						Math.abs(
							knownValues((position) => position.assetClass === label) / denominator -
								target.target,
						),
					),
				)
			: null;
	const maxDeviationAfter = proposal
		? Math.max(...[...parts, ...classes].map((row) => Math.abs(row.deviationAfter ?? 0)))
		: null;
	const status = statusFromCoverage(coverage.coverage);
	return createAnalysisResult({
		method: { id: methodIds.allocationVsTarget, version: "1.0.0" },
		strategyVersion: input.strategyVersion,
		asOf: input.asOf,
		inputs: input,
		assumptions: {
			weights:
				"Pesos atuais sobre patrimônio conhecido; desvios máximos antes/depois sobre patrimônio conhecido + aporte.",
			freshnessLimitDays: input.freshnessLimitDays ?? 30,
			allowSales: input.allowSales,
		},
		sources: evidence.sources,
		natures: evidence.natures,
		notVerified,
		findings,
		...(status === "inconclusive"
			? { status, output: null }
			: {
					status:
						findings.some((finding) => finding.severity === "blocked") || proposal === null
							? "partial"
							: status,
					output: {
						byPart: parts,
						byClass: classes,
						coverage: coverage.coverage,
						missingPositions,
						proposal,
						maxDeviationBefore,
						maxDeviationAfter,
					},
				}),
	});
}
