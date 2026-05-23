import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
	type CashAccount,
	type ContributionCycle,
	type ContributionPlan,
	cycleStatuses,
	defaultApiBase,
	formatCurrency,
	getCurrentCycleMonth,
	getNextReviewDate,
	getStrategy,
	jsonContentTypeHeader,
	type LoadState,
	loadStates,
	normalizeApiBase,
	type SavedReport,
	type StrategyId,
	statusLabels,
	storedApiBaseKey,
	storedPlanIdKey,
	storedPortfolioIdKey,
	strategyIds,
	strategyOptions,
	upsertCycle,
} from "./monthly-contribution.js";

export function App() {
	const [apiBase, setApiBase] = useState(() => readStoredValue(storedApiBaseKey, defaultApiBase));
	const [portfolioId, setPortfolioId] = useState(() => readStoredValue(storedPortfolioIdKey, ""));
	const [contributionPlanId, setContributionPlanId] = useState(() =>
		readStoredValue(storedPlanIdKey, ""),
	);
	const [cycleMonth, setCycleMonth] = useState(getCurrentCycleMonth);
	const [plans, setPlans] = useState<ContributionPlan[]>([]);
	const [cycles, setCycles] = useState<ContributionCycle[]>([]);
	const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
	const [confirmedAmount, setConfirmedAmount] = useState("");
	const [strategyId, setStrategyId] = useState<StrategyId>(strategyIds.balancedGrowth);
	const [notes, setNotes] = useState("");
	const [lastReport, setLastReport] = useState<SavedReport | null>(null);
	const [loadState, setLoadState] = useState<LoadState>(loadStates.idle);
	const [message, setMessage] = useState("");

	const activePlan = useMemo(
		() =>
			plans.find((plan) => plan.id === contributionPlanId) ??
			plans.find(
				(plan) =>
					plan.id === cycles.find((cycle) => cycle.cycleMonth === cycleMonth)?.contributionPlanId,
			) ??
			plans[0] ??
			null,
		[contributionPlanId, cycleMonth, cycles, plans],
	);
	const selectedCycle = useMemo(
		() =>
			cycles.find(
				(cycle) =>
					cycle.cycleMonth === cycleMonth &&
					(activePlan ? cycle.contributionPlanId === activePlan.id : true),
			) ?? null,
		[activePlan, cycleMonth, cycles],
	);
	const selectedStrategy = getStrategy(strategyId);
	const plannedAmount = selectedCycle?.plannedAmount ?? activePlan?.amount ?? "0";
	const cashAvailable = cashAccounts.reduce((total, account) => total + Number(account.balance), 0);
	const nextReviewDate = getNextReviewDate(cycleMonth, strategyId);
	const canLoad = portfolioId.trim().length > 0;
	const canCreateCycle = Boolean(activePlan) && !selectedCycle;
	const canConfirmCycle = Boolean(selectedCycle) && confirmedAmount.trim().length > 0;
	const canGenerateReport = selectedCycle?.status === cycleStatuses.confirmed;

	useEffect(() => {
		if (selectedCycle) {
			setConfirmedAmount(selectedCycle.confirmedAmount ?? selectedCycle.plannedAmount);
			setStrategyId(selectedCycle.strategyId);
			setNotes(selectedCycle.notes ?? "");
			return;
		}

		if (activePlan) {
			setConfirmedAmount(activePlan.amount);
			setStrategyId(activePlan.defaultStrategyId);
			setNotes("");
		}
	}, [activePlan, selectedCycle]);

	async function loadContributionWorkspace(event?: FormEvent<HTMLFormElement>) {
		event?.preventDefault();
		if (!canLoad) {
			setMessage("Informe um portfolioId para carregar o ciclo do mês.");
			setLoadState(loadStates.error);
			return;
		}

		setLoadState(loadStates.loading);
		setMessage("");
		setLastReport(null);

		try {
			const normalizedApiBase = normalizeApiBase(apiBase);
			const [loadedPlans, loadedCycles, loadedCashAccounts] = await Promise.all([
				apiRequest<ContributionPlan[]>(
					normalizedApiBase,
					`/portfolios/${portfolioId}/contribution-plans`,
				),
				apiRequest<ContributionCycle[]>(
					normalizedApiBase,
					`/portfolios/${portfolioId}/contribution-cycles`,
				),
				apiRequest<CashAccount[]>(normalizedApiBase, `/portfolios/${portfolioId}/cash-accounts`),
			]);
			const nextPlan =
				loadedPlans.find((plan) => plan.id === contributionPlanId) ?? loadedPlans[0] ?? null;

			setApiBase(normalizedApiBase);
			setPlans(loadedPlans);
			setCycles(loadedCycles);
			setCashAccounts(loadedCashAccounts);
			setContributionPlanId(nextPlan?.id ?? contributionPlanId);
			persistWorkspace(normalizedApiBase, portfolioId, nextPlan?.id ?? contributionPlanId);
			setLoadState(loadStates.ready);
			setMessage(
				nextPlan
					? "Dados carregados. Revise o ciclo do mês antes de confirmar."
					: "Dados carregados, mas nenhuma recorrência ativa foi encontrada.",
			);
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error));
		}
	}

	async function createMonthlyCycle() {
		if (!activePlan) {
			setMessage("Nenhum plano ativo foi carregado para criar o ciclo.");
			setLoadState(loadStates.error);
			return;
		}

		setLoadState(loadStates.loading);
		setMessage("");

		try {
			const cycle = await apiRequest<ContributionCycle>(
				normalizeApiBase(apiBase),
				`/contribution-plans/${activePlan.id}/cycles`,
				{
					body: JSON.stringify({
						cycleMonth,
						strategyId,
					}),
					method: "POST",
				},
			);
			setCycles((current) => upsertCycle(current, cycle));
			setContributionPlanId(activePlan.id);
			persistWorkspace(apiBase, portfolioId, activePlan.id);
			setLoadState(loadStates.ready);
			setMessage("Ciclo mensal criado. Confirme valor e estratégia antes do relatório.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error));
		}
	}

	async function confirmMonthlyCycle(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedCycle) {
			setMessage("Crie ou carregue o ciclo do mês antes de confirmar.");
			setLoadState(loadStates.error);
			return;
		}

		setLoadState(loadStates.loading);
		setMessage("");

		try {
			const cycle = await apiRequest<ContributionCycle>(
				normalizeApiBase(apiBase),
				`/contribution-cycles/${selectedCycle.id}`,
				{
					body: JSON.stringify({
						confirmedAmount: confirmedAmount.trim(),
						notes: notes.trim() || null,
						status: cycleStatuses.confirmed,
						strategyId,
					}),
					method: "PATCH",
				},
			);
			setCycles((current) => upsertCycle(current, cycle));
			setLoadState(loadStates.ready);
			setMessage("Ciclo confirmado. O relatório já pode ser gerado nesta tela.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error));
		}
	}

	async function generateReport() {
		if (!selectedCycle) {
			setMessage("Confirme ou selecione um ciclo antes de gerar relatório.");
			setLoadState(loadStates.error);
			return;
		}

		setLoadState(loadStates.loading);
		setMessage("");

		try {
			const report = await apiRequest<SavedReport>(
				normalizeApiBase(apiBase),
				`/portfolios/${portfolioId}/reports`,
				{ method: "POST" },
			);
			setLastReport(report);
			setLoadState(loadStates.ready);
			setMessage("Relatório salvo para revisão externa.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error));
		}
	}

	return (
		<main className="app-shell">
			<section className="workspace-header">
				<div>
					<p className="eyebrow">Decision Board</p>
					<h1>Aporte do mês</h1>
					<p className="summary">
						Acompanhe o ciclo mensal, confirme o aporte e gere o relatório estruturado com dados
						informativos da carteira.
					</p>
				</div>
				<div className="status-strip" aria-live="polite">
					<span className={`status-dot ${loadState}`} />
					<span>{loadState === loadStates.loading ? "Sincronizando" : "Fluxo mensal"}</span>
				</div>
			</section>

			<form className="setup-band" onSubmit={loadContributionWorkspace}>
				<label>
					<span>API</span>
					<input
						onChange={(event) => setApiBase(event.target.value)}
						placeholder="origem atual ou URL da API"
						value={apiBase}
					/>
				</label>
				<label>
					<span>Portfolio ID</span>
					<input
						onChange={(event) => setPortfolioId(event.target.value)}
						placeholder="uuid da carteira"
						value={portfolioId}
					/>
				</label>
				<label>
					<span>Plano de aporte</span>
					<input
						onChange={(event) => setContributionPlanId(event.target.value)}
						placeholder="opcional; usa o primeiro ativo"
						value={contributionPlanId}
					/>
				</label>
				<button
					className="primary-action"
					disabled={loadState === loadStates.loading}
					type="submit"
				>
					Carregar
				</button>
			</form>

			{message ? (
				<p className={`message ${loadState === loadStates.error ? "error" : ""}`}>{message}</p>
			) : null}

			<section className="overview-grid" aria-label="Resumo do ciclo mensal">
				<article className="metric-card">
					<span>Ciclo atual</span>
					<strong>{cycleMonth}</strong>
					<input
						aria-label="Mês do ciclo"
						className="compact-input"
						onChange={(event) => setCycleMonth(event.target.value)}
						type="month"
						value={cycleMonth}
					/>
				</article>
				<article className="metric-card">
					<span>Aporte planejado</span>
					<strong>{formatCurrency(plannedAmount)}</strong>
					<small>{activePlan ? "Recorrência ativa" : "Carregue um plano ativo"}</small>
				</article>
				<article className="metric-card">
					<span>Aporte confirmado</span>
					<strong>{formatCurrency(selectedCycle?.confirmedAmount ?? confirmedAmount)}</strong>
					<small>
						{selectedCycle ? statusLabels[selectedCycle.status] : "Ciclo ainda não criado"}
					</small>
				</article>
				<article className="metric-card">
					<span>Caixa disponível</span>
					<strong>{formatCurrency(cashAvailable)}</strong>
					<small>{cashAccounts.length} conta(s) de caixa</small>
				</article>
			</section>

			<section className="flow-grid">
				<div className="work-surface">
					<div className="section-heading">
						<div>
							<p className="eyebrow">Operação mensal</p>
							<h2>Ciclo de aporte</h2>
						</div>
						<button
							className="secondary-action"
							disabled={!canCreateCycle || loadState === loadStates.loading}
							onClick={createMonthlyCycle}
							type="button"
						>
							Criar ciclo
						</button>
					</div>

					<form className="cycle-form" onSubmit={confirmMonthlyCycle}>
						<label>
							<span>Valor confirmado</span>
							<input
								inputMode="decimal"
								onChange={(event) => setConfirmedAmount(event.target.value)}
								placeholder="1200.00"
								value={confirmedAmount}
							/>
						</label>
						<label>
							<span>Estratégia do ciclo</span>
							<select
								onChange={(event) => setStrategyId(event.target.value as StrategyId)}
								value={strategyId}
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
								onChange={(event) => setNotes(event.target.value)}
								placeholder="Registro opcional para o relatório e revisão humana"
								value={notes}
							/>
						</label>
						<button
							className="primary-action"
							disabled={!canConfirmCycle || loadState === loadStates.loading}
							type="submit"
						>
							Salvar confirmação
						</button>
					</form>
				</div>

				<aside className="review-surface">
					<p className="eyebrow">Revisão</p>
					<h2>{selectedStrategy.name}</h2>
					<dl>
						<div>
							<dt>Próxima revisão</dt>
							<dd>{nextReviewDate}</dd>
						</div>
						<div>
							<dt>Cadência</dt>
							<dd>{selectedStrategy.reportIntervalDays} dias</dd>
						</div>
						<div>
							<dt>Relatório</dt>
							<dd>
								{lastReport
									? `#${lastReport.id.slice(0, 8)} · ${lastReport.alertCount} alerta(s)`
									: "Ainda não gerado"}
							</dd>
						</div>
					</dl>
					<button
						className="secondary-action wide"
						disabled={!canGenerateReport || loadState === loadStates.loading}
						onClick={generateReport}
						type="button"
					>
						Gerar relatório
					</button>
				</aside>
			</section>
		</main>
	);
}

async function apiRequest<T>(apiBase: string, path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);

	if (init.body && !headers.has(jsonContentTypeHeader)) {
		headers.set(jsonContentTypeHeader, "application/json");
	}

	const response = await fetch(`${apiBase}${path}`, {
		...init,
		credentials: "include",
		headers,
	});

	if (!response.ok) {
		const body = await readResponseText(response);
		throw new Error(body || `Request failed with status ${response.status}`);
	}

	return response.json() as Promise<T>;
}

async function readResponseText(response: Response): Promise<string> {
	try {
		const payload = await response.json();
		if (payload && typeof payload === "object" && "message" in payload) {
			return String(payload.message);
		}
		return JSON.stringify(payload);
	} catch {
		return response.statusText;
	}
}

function readStoredValue(key: string, fallback: string): string {
	if (typeof window === "undefined") {
		return fallback;
	}

	return window.localStorage.getItem(key) ?? fallback;
}

function persistWorkspace(apiBase: string, portfolioId: string, contributionPlanId: string): void {
	window.localStorage.setItem(storedApiBaseKey, apiBase);
	window.localStorage.setItem(storedPortfolioIdKey, portfolioId);
	window.localStorage.setItem(storedPlanIdKey, contributionPlanId);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Falha inesperada no fluxo mensal.";
}
