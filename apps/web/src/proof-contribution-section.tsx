import type { FormEvent } from "react";
import {
	type ContributionCycle,
	formatCurrency,
	getStrategy,
	isConfirmableCycle,
	type SavedReport,
	type StrategyId,
	statusLabels,
	strategyOptions,
} from "./monthly-contribution.js";

export interface ProofContributionSectionProps {
	busy: boolean;
	cycleMonth: string;
	setCycleMonth: (value: string) => void;
	plannedAmount: string;
	activePlanPresent: boolean;
	confirmedAmountDisplay: string;
	selectedCycle: ContributionCycle | null;
	cashAvailable: number;
	cashAccountCount: number;
	canCreateCycle: boolean;
	canConfirmCycle: boolean;
	canGenerateReport: boolean;
	createMonthlyCycle: () => void;
	confirmMonthlyCycle: (event: FormEvent<HTMLFormElement>) => void;
	generateReport: () => void;
	confirmedAmount: string;
	setConfirmedAmount: (value: string) => void;
	confirmedAmountError: string | null;
	strategyId: StrategyId;
	setStrategyId: (value: StrategyId) => void;
	notes: string;
	setNotes: (value: string) => void;
	nextReviewDate: string;
	visibleReport: SavedReport | null;
	confirmedAmountErrorId: string;
}

export function ProofContributionSection(props: ProofContributionSectionProps) {
	const selectedStrategy = getStrategy(props.strategyId);

	return (
		<>
			<section className="overview-grid" aria-label="Resumo do ciclo mensal">
				<article className="metric-card">
					<span>Ciclo atual</span>
					<strong>{props.cycleMonth}</strong>
					<input
						aria-label="Mês do ciclo"
						className="compact-input"
						onChange={(event) => props.setCycleMonth(event.target.value)}
						type="month"
						value={props.cycleMonth}
					/>
				</article>
				<article className="metric-card">
					<span>Aporte planejado</span>
					<strong>{formatCurrency(props.plannedAmount)}</strong>
					<small>{props.activePlanPresent ? "Recorrência ativa" : "Carregue um plano ativo"}</small>
				</article>
				<article className="metric-card">
					<span>Aporte confirmado</span>
					<strong>{props.confirmedAmountDisplay}</strong>
					<small>
						{props.selectedCycle
							? statusLabels[props.selectedCycle.status]
							: "Ciclo ainda não criado"}
					</small>
				</article>
				<article className="metric-card">
					<span>Caixa disponível</span>
					<strong>{formatCurrency(props.cashAvailable)}</strong>
					<small>{props.cashAccountCount} conta(s) de caixa</small>
				</article>
			</section>

			<section className="flow-grid">
				<div className="work-surface">
					<div className="section-heading">
						<div>
							<p className="eyebrow">Passo 4</p>
							<h2>Ciclo de aporte</h2>
						</div>
						<button
							className="secondary-action"
							disabled={!props.canCreateCycle || props.busy}
							onClick={props.createMonthlyCycle}
							type="button"
						>
							Criar ciclo
						</button>
					</div>

					<form className="cycle-form proof-form" onSubmit={props.confirmMonthlyCycle}>
						<label>
							<span>Valor confirmado</span>
							<input
								aria-describedby={
									props.confirmedAmountError ? props.confirmedAmountErrorId : undefined
								}
								aria-invalid={Boolean(props.confirmedAmountError)}
								inputMode="decimal"
								onChange={(event) => props.setConfirmedAmount(event.target.value)}
								placeholder="1200.00"
								value={props.confirmedAmount}
							/>
							{props.confirmedAmountError ? (
								<small className="field-error" id={props.confirmedAmountErrorId}>
									{props.confirmedAmountError}
								</small>
							) : null}
						</label>
						<label>
							<span>Estratégia do ciclo</span>
							<select
								onChange={(event) => props.setStrategyId(event.target.value as StrategyId)}
								value={props.strategyId}
							>
								{strategyOptions.map((strategy) => (
									<option key={strategy.id} value={strategy.id}>
										{strategy.name}
									</option>
								))}
							</select>
						</label>
						<label className="full-row">
							<span>Notas operacionais</span>
							<textarea
								onChange={(event) => props.setNotes(event.target.value)}
								placeholder="Registro opcional para o relatório e revisão humana"
								value={props.notes}
							/>
						</label>
						<button
							className="primary-action"
							disabled={!props.canConfirmCycle || props.busy}
							type="submit"
						>
							{props.selectedCycle && !isConfirmableCycle(props.selectedCycle)
								? "Ciclo encerrado"
								: "Salvar confirmação"}
						</button>
					</form>
				</div>

				<aside className="review-surface">
					<p className="eyebrow">Revisão</p>
					<h2>{selectedStrategy.name}</h2>
					<dl>
						<div>
							<dt>Próxima revisão</dt>
							<dd>{props.nextReviewDate}</dd>
						</div>
						<div>
							<dt>Cadência</dt>
							<dd>{selectedStrategy.reportIntervalDays} dias</dd>
						</div>
						<div>
							<dt>Relatório</dt>
							<dd>
								{props.visibleReport
									? `#${props.visibleReport.id.slice(0, 8)} · ${props.visibleReport.alertCount} alerta(s)`
									: "Ainda não gerado"}
							</dd>
						</div>
					</dl>
					<button
						className="secondary-action wide"
						disabled={!props.canGenerateReport || props.busy}
						onClick={props.generateReport}
						type="button"
					>
						Gerar relatório
					</button>
				</aside>
			</section>
		</>
	);
}
