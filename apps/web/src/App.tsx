import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { apiRequest, apiRequestAllowUnauthorized, getErrorMessage } from "./api-client.js";
import {
	type AssetSummary,
	type CashAccount,
	type ContributionCycle,
	type ContributionPlan,
	type CurrentReportEnvelope,
	canConfirmContributionCycle,
	canGenerateContributionReport,
	cycleStatuses,
	defaultApiBase,
	formatCurrency,
	getCurrentCycleMonth,
	getNextReviewDate,
	isConfirmableCycle,
	type LoadState,
	loadStates,
	markCycleReported,
	normalizeApiBase,
	normalizeConfirmedAmount,
	type PortfolioSummary,
	type PositionSummary,
	type ReportHistoryItem,
	type SavedReport,
	type SessionUser,
	type StrategyId,
	storedApiBaseKey,
	storedPlanIdKey,
	storedPortfolioIdKey,
	strategyIds,
	upsertCycle,
} from "./monthly-contribution.js";
import { ProofContributionSection } from "./proof-contribution-section.js";
import { nextBusyLoadState, resolveListedPortfolioId } from "./proof-load-state.js";
import { ProofReportsSection } from "./proof-reports-section.js";
import { ProofSeedSection } from "./proof-seed-section.js";
import { ProofSetupSection } from "./proof-setup-section.js";
import { persistWorkspace, readStoredValue } from "./proof-storage.js";
import { loadProofWorkspaceData } from "./proof-workspace-load.js";
export function App() {
	const confirmedAmountErrorId = useId();
	const [apiBase, setApiBase] = useState(() => readStoredValue(storedApiBaseKey, defaultApiBase));
	const [session, setSession] = useState<SessionUser | null>(null);
	const [sessionKnown, setSessionKnown] = useState(false);
	const [authName, setAuthName] = useState("");
	const [authEmail, setAuthEmail] = useState("");
	const [authPassword, setAuthPassword] = useState("");
	const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
	const [portfolioId, setPortfolioId] = useState(() => readStoredValue(storedPortfolioIdKey, ""));
	const [newPortfolioName, setNewPortfolioName] = useState("");
	const [contributionPlanId, setContributionPlanId] = useState(() =>
		readStoredValue(storedPlanIdKey, ""),
	);
	const [cycleMonth, setCycleMonth] = useState(getCurrentCycleMonth);
	const [plans, setPlans] = useState<ContributionPlan[]>([]);
	const [cycles, setCycles] = useState<ContributionCycle[]>([]);
	const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
	const [positions, setPositions] = useState<PositionSummary[]>([]);
	const [assets, setAssets] = useState<AssetSummary[]>([]);
	const [confirmedAmount, setConfirmedAmount] = useState("");
	const [strategyId, setStrategyId] = useState<StrategyId>(strategyIds.balancedGrowth);
	const [notes, setNotes] = useState("");
	const [lastReport, setLastReport] = useState<SavedReport | null>(null);
	const [lastReportCycleId, setLastReportCycleId] = useState<string | null>(null);
	const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
	const [currentReport, setCurrentReport] = useState<CurrentReportEnvelope | null>(null);
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
	const plannedAmount = selectedCycle?.plannedAmount ?? activePlan?.amount ?? "0";
	const cashAvailable = cashAccounts.reduce((total, account) => total + Number(account.balance), 0);
	const nextReviewDate = getNextReviewDate(cycleMonth, strategyId);
	const confirmedAmountValidation = normalizeConfirmedAmount(confirmedAmount);
	const confirmedAmountError =
		confirmedAmount.trim().length > 0 ? confirmedAmountValidation.error : null;
	const confirmedAmountDisplay =
		confirmedAmount.trim().length > 0 && confirmedAmountValidation.error
			? "Valor inválido"
			: formatCurrency(selectedCycle?.confirmedAmount ?? confirmedAmount);
	const visibleReport = selectedCycle?.id === lastReportCycleId ? lastReport : null;
	const canLoad = Boolean(session) && portfolioId.trim().length > 0;
	const canCreateCycle = Boolean(activePlan) && !selectedCycle;
	const canConfirmCycle = canConfirmContributionCycle(selectedCycle, confirmedAmountValidation);
	const canGenerateReport = canGenerateContributionReport(selectedCycle, lastReportCycleId);
	const busy = loadState === loadStates.loading;

	// biome-ignore lint/correctness/useExhaustiveDependencies: one-shot cookie session hydrate on mount
	useEffect(() => {
		void refreshSession(normalizeApiBase(apiBase));
	}, []);

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

	function reportMessage(next: string, error = false) {
		setMessage(next);
		if (!next) {
			return;
		}
		setLoadState(error ? loadStates.error : loadStates.ready);
	}

	async function refreshSession(base = normalizeApiBase(apiBase)): Promise<SessionUser | null> {
		if (!base) {
			setSession(null);
			setSessionKnown(true);
			return null;
		}
		try {
			const user = await apiRequestAllowUnauthorized<SessionUser>(base, "/me");
			setSession(user);
			setSessionKnown(true);
			persistWorkspace(base, portfolioId, contributionPlanId);
			if (user) await loadPortfolios(base);
			else setPortfolios([]);
			return user;
		} catch (error) {
			setSession(null);
			setSessionKnown(true);
			reportMessage(getErrorMessage(error, "Falha ao verificar sessão."), true);
			return null;
		}
	}

	async function loadPortfolios(
		base = normalizeApiBase(apiBase),
		preferredId = portfolioId,
	): Promise<PortfolioSummary[]> {
		const listed = await apiRequest<PortfolioSummary[]>(base, "/portfolios");
		setPortfolios(listed);
		const selectedId = resolveListedPortfolioId(listed, preferredId);
		if (selectedId && selectedId !== preferredId) {
			setPortfolioId(selectedId);
			persistWorkspace(base, selectedId, contributionPlanId);
		}
		return listed;
	}

	async function signUp(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			setApiBase(base);
			await apiRequest(base, "/auth/sign-up/email", {
				method: "POST",
				body: JSON.stringify({
					name: authName.trim(),
					email: authEmail.trim(),
					password: authPassword,
				}),
			});
			await refreshSession(base);
			setAuthPassword("");
			reportMessage("Conta criada e sessão ativa.");
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha no sign-up."), true);
		}
	}

	async function signIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			setApiBase(base);
			await apiRequest(base, "/auth/sign-in/email", {
				method: "POST",
				body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
			});
			await refreshSession(base);
			setAuthPassword("");
			reportMessage("Sessão iniciada.");
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha no sign-in."), true);
		}
	}

	async function signOut() {
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			await apiRequest(normalizeApiBase(apiBase), "/auth/sign-out", { method: "POST" });
			setSession(null);
			setPortfolios([]);
			setPlans([]);
			setCycles([]);
			setCashAccounts([]);
			setPositions([]);
			setAssets([]);
			setCurrentReport(null);
			setReportHistory([]);
			reportMessage("Sessão encerrada.");
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha no sign-out."), true);
		}
	}

	async function createPortfolio(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!session) {
			reportMessage("Faça login antes de criar um portfolio.", true);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const portfolio = await apiRequest<PortfolioSummary>(base, "/portfolios", {
				method: "POST",
				body: JSON.stringify({
					name: newPortfolioName.trim() || "Carteira de prova",
					baseCurrency: "BRL",
				}),
			});
			setNewPortfolioName("");
			setPortfolioId(portfolio.id);
			persistWorkspace(base, portfolio.id, contributionPlanId);
			await loadPortfolios(base, portfolio.id);
			reportMessage(`Portfolio criado: ${portfolio.name}`);
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha ao criar portfolio."), true);
		}
	}

	async function loadContributionWorkspace(event?: FormEvent<HTMLFormElement>) {
		event?.preventDefault();
		if (!canLoad) {
			reportMessage("Selecione um portfolio (após login) para carregar o ciclo do mês.", true);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		setLastReport(null);
		setLastReportCycleId(null);
		try {
			const base = normalizeApiBase(apiBase);
			const [loadedPlans, loadedCycles, loadedCash, loadedPositions, loadedAssets, history] =
				await loadProofWorkspaceData(base, portfolioId);
			const nextPlan =
				loadedPlans.find((plan) => plan.id === contributionPlanId) ?? loadedPlans[0] ?? null;
			setApiBase(base);
			setPlans(loadedPlans);
			setCycles(loadedCycles);
			setCashAccounts(loadedCash);
			setPositions(loadedPositions);
			setAssets(loadedAssets);
			setReportHistory(history);
			setContributionPlanId(nextPlan?.id ?? contributionPlanId);
			persistWorkspace(base, portfolioId, nextPlan?.id ?? contributionPlanId);
			reportMessage(
				nextPlan
					? "Dados carregados. Revise o ciclo do mês antes de confirmar."
					: "Dados carregados, mas nenhuma recorrência ativa foi encontrada.",
			);
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha ao carregar workspace."), true);
		}
	}

	async function createMonthlyCycle() {
		if (!activePlan) {
			reportMessage("Nenhum plano ativo foi carregado para criar o ciclo.", true);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const cycle = await apiRequest<ContributionCycle>(
				normalizeApiBase(apiBase),
				`/contribution-plans/${activePlan.id}/cycles`,
				{ body: JSON.stringify({ cycleMonth, strategyId }), method: "POST" },
			);
			setCycles((current) => upsertCycle(current, cycle));
			setContributionPlanId(activePlan.id);
			persistWorkspace(normalizeApiBase(apiBase), portfolioId, activePlan.id);
			reportMessage("Ciclo mensal criado. Confirme valor e estratégia antes do relatório.");
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha ao criar ciclo."), true);
		}
	}

	async function confirmMonthlyCycle(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedCycle) {
			reportMessage("Crie ou carregue o ciclo do mês antes de confirmar.", true);
			return;
		}
		if (!isConfirmableCycle(selectedCycle)) {
			reportMessage("Este ciclo já foi encerrado para confirmação.", true);
			return;
		}
		if (confirmedAmountValidation.error) {
			reportMessage(confirmedAmountValidation.error, true);
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
						confirmedAmount: confirmedAmountValidation.value,
						notes: notes.trim() || null,
						status: cycleStatuses.confirmed,
						strategyId,
					}),
					method: "PATCH",
				},
			);
			setCycles((current) => upsertCycle(current, cycle));
			reportMessage("Ciclo confirmado. O relatório já pode ser gerado nesta tela.");
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha ao confirmar ciclo."), true);
		}
	}

	async function generateReport() {
		if (!selectedCycle) {
			reportMessage("Confirme ou selecione um ciclo antes de gerar relatório.", true);
			return;
		}
		if (!canGenerateReport) {
			reportMessage("O relatório deste ciclo só pode ser gerado uma vez após confirmação.", true);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const report = await apiRequest<SavedReport>(base, `/portfolios/${portfolioId}/reports`, {
				body: JSON.stringify({ contributionCycleId: selectedCycle.id }),
				method: "POST",
			});
			setLastReport(report);
			setLastReportCycleId(selectedCycle.id);
			setCycles((current) => upsertCycle(current, markCycleReported(selectedCycle)));
			setReportHistory(
				await apiRequest<ReportHistoryItem[]>(base, `/portfolios/${portfolioId}/reports`),
			);
			reportMessage("Relatório salvo para revisão externa.");
		} catch (error) {
			reportMessage(getErrorMessage(error, "Falha ao gerar relatório."), true);
		}
	}

	return (
		<main className="app-shell">
			<p className="proof-banner">
				Prova de fluxo / temporária — não é UX de produto. Wiring operacional para exercitar a API.
			</p>
			<section className="workspace-header">
				<div>
					<p className="eyebrow">Decision Board</p>
					<h1>Harness de prova</h1>
					<p className="summary">
						Auth → portfolio → posição/caixa → aporte → preço → relatório, sem colar UUID no caminho
						principal.
					</p>
				</div>
				<div className="status-strip" aria-live="polite">
					<span className={`status-dot ${loadState}`} />
					<span>{busy ? "Sincronizando" : "Fluxo de prova"}</span>
				</div>
			</section>

			<ProofSetupSection
				apiBase={apiBase}
				authEmail={authEmail}
				authName={authName}
				authPassword={authPassword}
				busy={busy}
				canLoad={canLoad}
				contributionPlanId={contributionPlanId}
				createPortfolio={createPortfolio}
				loadContributionWorkspace={loadContributionWorkspace}
				loadPortfolios={() => void loadPortfolios()}
				newPortfolioName={newPortfolioName}
				plans={plans}
				portfolioId={portfolioId}
				portfolios={portfolios}
				session={session}
				sessionKnown={sessionKnown}
				setApiBase={setApiBase}
				setAuthEmail={setAuthEmail}
				setAuthName={setAuthName}
				setAuthPassword={setAuthPassword}
				setContributionPlanId={setContributionPlanId}
				setNewPortfolioName={setNewPortfolioName}
				setPortfolioId={setPortfolioId}
				signIn={signIn}
				signOut={signOut}
				signUp={signUp}
			/>

			{message ? (
				<p className={`message ${loadState === loadStates.error ? "error" : ""}`}>{message}</p>
			) : null}

			<ProofSeedSection
				apiBase={apiBase}
				assets={assets}
				busy={busy}
				cashAccounts={cashAccounts}
				onAssetsChange={setAssets}
				onBusy={(next) => setLoadState((current) => nextBusyLoadState(current, next))}
				onCashAccountsChange={setCashAccounts}
				onMessage={(next, error) => reportMessage(next, error)}
				onPlanCreated={(plan) => {
					setPlans((current) => [plan, ...current]);
					setContributionPlanId(plan.id);
					persistWorkspace(normalizeApiBase(apiBase), portfolioId, plan.id);
				}}
				onPositionsChange={setPositions}
				portfolioId={portfolioId}
				positions={positions}
				sessionActive={Boolean(session)}
			/>

			<ProofContributionSection
				activePlanPresent={Boolean(activePlan)}
				busy={busy}
				canConfirmCycle={canConfirmCycle}
				canCreateCycle={canCreateCycle}
				canGenerateReport={canGenerateReport}
				cashAccountCount={cashAccounts.length}
				cashAvailable={cashAvailable}
				confirmMonthlyCycle={confirmMonthlyCycle}
				confirmedAmount={confirmedAmount}
				confirmedAmountDisplay={confirmedAmountDisplay}
				confirmedAmountError={confirmedAmountError}
				confirmedAmountErrorId={confirmedAmountErrorId}
				createMonthlyCycle={createMonthlyCycle}
				cycleMonth={cycleMonth}
				generateReport={generateReport}
				nextReviewDate={nextReviewDate}
				notes={notes}
				plannedAmount={plannedAmount}
				selectedCycle={selectedCycle}
				setConfirmedAmount={setConfirmedAmount}
				setCycleMonth={setCycleMonth}
				setNotes={setNotes}
				setStrategyId={setStrategyId}
				strategyId={strategyId}
				visibleReport={visibleReport}
			/>

			<ProofReportsSection
				apiBase={apiBase}
				busy={busy}
				currentReport={currentReport}
				onBusy={(next) => setLoadState((current) => nextBusyLoadState(current, next))}
				onCurrentReportChange={setCurrentReport}
				onMessage={(next, error) => reportMessage(next, error)}
				portfolioId={portfolioId}
				reportHistory={reportHistory}
			/>
		</main>
	);
}
