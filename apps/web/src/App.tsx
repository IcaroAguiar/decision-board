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
	getStrategy,
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
	statusLabels,
	storedApiBaseKey,
	storedPlanIdKey,
	storedPortfolioIdKey,
	strategyIds,
	strategyOptions,
	upsertCycle,
} from "./monthly-contribution.js";

const assetTypeOptions = ["fii", "stock", "etf", "cash", "other"] as const;
const riskCategoryOptions = ["brick", "paper", "hybrid", "cash", "other"] as const;

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

	const [assetTicker, setAssetTicker] = useState("");
	const [assetName, setAssetName] = useState("");
	const [assetType, setAssetType] = useState<(typeof assetTypeOptions)[number]>("fii");
	const [riskCategory, setRiskCategory] = useState<(typeof riskCategoryOptions)[number]>("paper");
	const [selectedAssetId, setSelectedAssetId] = useState("");
	const [priceValue, setPriceValue] = useState("");
	const [positionQuantity, setPositionQuantity] = useState("");
	const [positionAveragePrice, setPositionAveragePrice] = useState("");
	const [positionManualPrice, setPositionManualPrice] = useState("");
	const [cashName, setCashName] = useState("Reserva");
	const [cashType, setCashType] = useState("CDB");
	const [cashBalance, setCashBalance] = useState("");
	const [planAmount, setPlanAmount] = useState("1000");
	const [planDayOfMonth, setPlanDayOfMonth] = useState("10");
	const [planStartsAt, setPlanStartsAt] = useState(() => `${getCurrentCycleMonth()}-01`);
	const [planCashAccountId, setPlanCashAccountId] = useState("");
	const [planStrategyId, setPlanStrategyId] = useState<StrategyId>(strategyIds.balancedGrowth);

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

	async function refreshSession(base = normalizeApiBase(apiBase)): Promise<SessionUser | null> {
		try {
			const user = await apiRequestAllowUnauthorized<SessionUser>(base, "/me");
			setSession(user);
			setSessionKnown(true);
			if (user) {
				await loadPortfolios(base);
			} else {
				setPortfolios([]);
			}
			return user;
		} catch (error) {
			setSession(null);
			setSessionKnown(true);
			setMessage(getErrorMessage(error, "Falha ao verificar sessão."));
			setLoadState(loadStates.error);
			return null;
		}
	}

	async function loadPortfolios(base = normalizeApiBase(apiBase)): Promise<PortfolioSummary[]> {
		const listed = await apiRequest<PortfolioSummary[]>(base, "/portfolios");
		setPortfolios(listed);
		if (listed.length === 0) {
			return listed;
		}
		const stillSelected = listed.some((portfolio) => portfolio.id === portfolioId);
		const firstPortfolio = listed[0];
		if (!stillSelected && firstPortfolio) {
			setPortfolioId(firstPortfolio.id);
			persistWorkspace(base, firstPortfolio.id, contributionPlanId);
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
			setLoadState(loadStates.ready);
			setMessage("Conta criada e sessão ativa.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha no sign-up."));
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
				body: JSON.stringify({
					email: authEmail.trim(),
					password: authPassword,
				}),
			});
			await refreshSession(base);
			setAuthPassword("");
			setLoadState(loadStates.ready);
			setMessage("Sessão iniciada.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha no sign-in."));
		}
	}

	async function signOut() {
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			await apiRequest(base, "/auth/sign-out", { method: "POST" });
			setSession(null);
			setPortfolios([]);
			setPlans([]);
			setCycles([]);
			setCashAccounts([]);
			setPositions([]);
			setAssets([]);
			setCurrentReport(null);
			setReportHistory([]);
			setLoadState(loadStates.ready);
			setMessage("Sessão encerrada.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha no sign-out."));
		}
	}

	async function createPortfolio(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!session) {
			setMessage("Faça login antes de criar um portfolio.");
			setLoadState(loadStates.error);
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
			await loadPortfolios(base);
			setLoadState(loadStates.ready);
			setMessage(`Portfolio criado: ${portfolio.name}`);
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao criar portfolio."));
		}
	}

	async function loadContributionWorkspace(event?: FormEvent<HTMLFormElement>) {
		event?.preventDefault();
		if (!canLoad) {
			setMessage("Selecione um portfolio (após login) para carregar o ciclo do mês.");
			setLoadState(loadStates.error);
			return;
		}

		setLoadState(loadStates.loading);
		setMessage("");
		setLastReport(null);
		setLastReportCycleId(null);

		try {
			const normalizedApiBase = normalizeApiBase(apiBase);
			const [
				loadedPlans,
				loadedCycles,
				loadedCashAccounts,
				loadedPositions,
				loadedAssets,
				loadedHistory,
			] = await Promise.all([
				apiRequest<ContributionPlan[]>(
					normalizedApiBase,
					`/portfolios/${portfolioId}/contribution-plans`,
				),
				apiRequest<ContributionCycle[]>(
					normalizedApiBase,
					`/portfolios/${portfolioId}/contribution-cycles`,
				),
				apiRequest<CashAccount[]>(normalizedApiBase, `/portfolios/${portfolioId}/cash-accounts`),
				apiRequest<PositionSummary[]>(normalizedApiBase, `/portfolios/${portfolioId}/positions`),
				apiRequest<AssetSummary[]>(normalizedApiBase, "/assets?limit=50"),
				apiRequest<ReportHistoryItem[]>(normalizedApiBase, `/portfolios/${portfolioId}/reports`),
			]);
			const nextPlan =
				loadedPlans.find((plan) => plan.id === contributionPlanId) ?? loadedPlans[0] ?? null;

			setApiBase(normalizedApiBase);
			setPlans(loadedPlans);
			setCycles(loadedCycles);
			setCashAccounts(loadedCashAccounts);
			setPositions(loadedPositions);
			setAssets(loadedAssets);
			setReportHistory(loadedHistory);
			setContributionPlanId(nextPlan?.id ?? contributionPlanId);
			if (!selectedAssetId && loadedAssets[0]) {
				setSelectedAssetId(loadedAssets[0].id);
			}
			if (!planCashAccountId && loadedCashAccounts[0]) {
				setPlanCashAccountId(loadedCashAccounts[0].id);
			}
			persistWorkspace(normalizedApiBase, portfolioId, nextPlan?.id ?? contributionPlanId);
			setLoadState(loadStates.ready);
			setMessage(
				nextPlan
					? "Dados carregados. Revise o ciclo do mês antes de confirmar."
					: "Dados carregados, mas nenhuma recorrência ativa foi encontrada.",
			);
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao carregar workspace."));
		}
	}

	async function createAsset(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const asset = await apiRequest<AssetSummary>(base, "/assets", {
				method: "POST",
				body: JSON.stringify({
					ticker: assetTicker.trim().toUpperCase(),
					name: assetName.trim() || assetTicker.trim().toUpperCase(),
					assetType,
					riskCategory,
					currency: "brl",
					exchange: "B3",
				}),
			});
			setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
			setSelectedAssetId(asset.id);
			setAssetTicker("");
			setAssetName("");
			setLoadState(loadStates.ready);
			setMessage(`Asset criado: ${asset.ticker}`);
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao criar asset."));
		}
	}

	async function createManualPrice(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedAssetId) {
			setMessage("Selecione um asset para o snapshot de preço.");
			setLoadState(loadStates.error);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			await apiRequest(base, `/assets/${selectedAssetId}/price-snapshots`, {
				method: "POST",
				body: JSON.stringify({
					price: priceValue.trim().replace(",", "."),
					currency: "brl",
					capturedAt: new Date().toISOString(),
				}),
			});
			setLoadState(loadStates.ready);
			setMessage("Snapshot de preço manual gravado.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao gravar preço."));
		}
	}

	async function refreshPriceFromProvider() {
		if (!selectedAssetId) {
			setMessage("Selecione um asset para refresh.");
			setLoadState(loadStates.error);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			await apiRequest(base, `/assets/${selectedAssetId}/price-snapshots/refresh`, {
				method: "POST",
				body: "{}",
			});
			setLoadState(loadStates.ready);
			setMessage("Refresh de provider solicitado.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha no refresh de preço."));
		}
	}

	async function createPosition(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portfolioId || !selectedAssetId) {
			setMessage("Selecione portfolio e asset antes de criar posição.");
			setLoadState(loadStates.error);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const body: Record<string, string> = {
				assetId: selectedAssetId,
				quantity: positionQuantity.trim().replace(",", "."),
				averagePrice: positionAveragePrice.trim().replace(",", "."),
			};
			if (positionManualPrice.trim()) {
				body.manualCurrentPrice = positionManualPrice.trim().replace(",", ".");
			}
			const position = await apiRequest<PositionSummary>(
				base,
				`/portfolios/${portfolioId}/positions`,
				{ method: "POST", body: JSON.stringify(body) },
			);
			setPositions((current) => [position, ...current]);
			setLoadState(loadStates.ready);
			setMessage("Posição criada.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao criar posição."));
		}
	}

	async function createCashAccount(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portfolioId) {
			setMessage("Selecione um portfolio antes de criar caixa.");
			setLoadState(loadStates.error);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const account = await apiRequest<CashAccount>(
				base,
				`/portfolios/${portfolioId}/cash-accounts`,
				{
					method: "POST",
					body: JSON.stringify({
						name: cashName.trim() || "Reserva",
						type: cashType.trim() || "CDB",
						balance: cashBalance.trim().replace(",", ".") || "0",
						liquidity: "D+0",
					}),
				},
			);
			setCashAccounts((current) => [account, ...current]);
			setPlanCashAccountId(account.id);
			setLoadState(loadStates.ready);
			setMessage(`Conta de caixa criada: ${account.name}`);
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao criar conta de caixa."));
		}
	}

	async function createContributionPlan(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portfolioId) {
			setMessage("Selecione um portfolio antes de criar o plano.");
			setLoadState(loadStates.error);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const body: Record<string, string | number | null> = {
				amount: planAmount.trim().replace(",", "."),
				frequency: "monthly",
				dayOfMonth: Number(planDayOfMonth),
				startsAt: planStartsAt,
				defaultStrategyId: planStrategyId,
			};
			if (planCashAccountId) {
				body.cashAccountId = planCashAccountId;
			}
			const plan = await apiRequest<ContributionPlan>(
				base,
				`/portfolios/${portfolioId}/contribution-plans`,
				{ method: "POST", body: JSON.stringify(body) },
			);
			setPlans((current) => [plan, ...current]);
			setContributionPlanId(plan.id);
			persistWorkspace(base, portfolioId, plan.id);
			setLoadState(loadStates.ready);
			setMessage("Plano de aporte criado.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao criar plano de aporte."));
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
			setMessage(getErrorMessage(error, "Falha ao criar ciclo."));
		}
	}

	async function confirmMonthlyCycle(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedCycle) {
			setMessage("Crie ou carregue o ciclo do mês antes de confirmar.");
			setLoadState(loadStates.error);
			return;
		}
		if (!isConfirmableCycle(selectedCycle)) {
			setMessage("Este ciclo já foi encerrado para confirmação.");
			setLoadState(loadStates.error);
			return;
		}
		if (confirmedAmountValidation.error) {
			setMessage(confirmedAmountValidation.error);
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
						confirmedAmount: confirmedAmountValidation.value,
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
			setMessage(getErrorMessage(error, "Falha ao confirmar ciclo."));
		}
	}

	async function generateReport() {
		if (!selectedCycle) {
			setMessage("Confirme ou selecione um ciclo antes de gerar relatório.");
			setLoadState(loadStates.error);
			return;
		}
		if (!canGenerateReport) {
			setMessage("O relatório deste ciclo só pode ser gerado uma vez após confirmação.");
			setLoadState(loadStates.error);
			return;
		}

		setLoadState(loadStates.loading);
		setMessage("");

		try {
			const base = normalizeApiBase(apiBase);
			const report = await apiRequest<SavedReport>(base, `/portfolios/${portfolioId}/reports`, {
				body: JSON.stringify({
					contributionCycleId: selectedCycle.id,
				}),
				method: "POST",
			});
			setLastReport(report);
			setLastReportCycleId(selectedCycle.id);
			setCycles((current) => upsertCycle(current, markCycleReported(selectedCycle)));
			const history = await apiRequest<ReportHistoryItem[]>(
				base,
				`/portfolios/${portfolioId}/reports`,
			);
			setReportHistory(history);
			setLoadState(loadStates.ready);
			setMessage("Relatório salvo para revisão externa.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao gerar relatório."));
		}
	}

	async function loadCurrentReport() {
		if (!portfolioId) {
			setMessage("Selecione um portfolio para carregar current.json.");
			setLoadState(loadStates.error);
			return;
		}
		setLoadState(loadStates.loading);
		setMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			const envelope = await apiRequest<CurrentReportEnvelope>(
				base,
				`/portfolios/${portfolioId}/reports/current.json`,
			);
			setCurrentReport(envelope);
			setLoadState(loadStates.ready);
			setMessage("current.json carregado.");
		} catch (error) {
			setLoadState(loadStates.error);
			setMessage(getErrorMessage(error, "Falha ao carregar current.json."));
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

			<section className="proof-section" aria-label="API e autenticação">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Passo 1</p>
						<h2>API e sessão</h2>
					</div>
				</div>
				<label>
					<span>API base</span>
					<input
						onChange={(event) => setApiBase(event.target.value)}
						placeholder="http://localhost:3001"
						value={apiBase}
					/>
				</label>
				<p className="hint">
					{sessionKnown
						? session
							? `Sessão: ${session.email}`
							: "Sem sessão. Use sign-up ou sign-in."
						: "Verificando sessão…"}
				</p>
				{session ? (
					<button className="secondary-action" disabled={busy} onClick={signOut} type="button">
						Sign out
					</button>
				) : (
					<div className="proof-form-grid">
						<form className="cycle-form proof-form" onSubmit={signUp}>
							<label>
								<span>Nome (sign-up)</span>
								<input
									onChange={(event) => setAuthName(event.target.value)}
									required
									value={authName}
								/>
							</label>
							<label>
								<span>E-mail</span>
								<input
									autoComplete="username"
									onChange={(event) => setAuthEmail(event.target.value)}
									required
									type="email"
									value={authEmail}
								/>
							</label>
							<label>
								<span>Senha</span>
								<input
									autoComplete="new-password"
									onChange={(event) => setAuthPassword(event.target.value)}
									required
									type="password"
									value={authPassword}
								/>
							</label>
							<button className="primary-action" disabled={busy} type="submit">
								Sign up
							</button>
						</form>
						<form className="cycle-form proof-form" onSubmit={signIn}>
							<label>
								<span>E-mail</span>
								<input
									autoComplete="username"
									onChange={(event) => setAuthEmail(event.target.value)}
									required
									type="email"
									value={authEmail}
								/>
							</label>
							<label>
								<span>Senha</span>
								<input
									autoComplete="current-password"
									onChange={(event) => setAuthPassword(event.target.value)}
									required
									type="password"
									value={authPassword}
								/>
							</label>
							<button className="primary-action" disabled={busy} type="submit">
								Sign in
							</button>
						</form>
					</div>
				)}
			</section>

			<section className="proof-section" aria-label="Portfolio">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Passo 2</p>
						<h2>Portfolio</h2>
					</div>
					<button
						className="secondary-action"
						disabled={!session || busy}
						onClick={() => void loadPortfolios()}
						type="button"
					>
						Atualizar lista
					</button>
				</div>
				<form className="setup-band" onSubmit={loadContributionWorkspace}>
					<label>
						<span>Carteira</span>
						<select
							disabled={!session || portfolios.length === 0}
							onChange={(event) => {
								setPortfolioId(event.target.value);
								persistWorkspace(normalizeApiBase(apiBase), event.target.value, contributionPlanId);
							}}
							value={portfolioId}
						>
							{portfolios.length === 0 ? (
								<option value="">Nenhum portfolio — crie um abaixo</option>
							) : (
								portfolios.map((portfolio) => (
									<option key={portfolio.id} value={portfolio.id}>
										{portfolio.name} ({portfolio.baseCurrency})
									</option>
								))
							)}
						</select>
					</label>
					<label>
						<span>Plano (opcional)</span>
						<select
							onChange={(event) => setContributionPlanId(event.target.value)}
							value={contributionPlanId}
						>
							<option value="">Primeiro plano ativo</option>
							{plans.map((plan) => (
								<option key={plan.id} value={plan.id}>
									{plan.amount} · {plan.defaultStrategyId}
								</option>
							))}
						</select>
					</label>
					<button className="primary-action" disabled={!canLoad || busy} type="submit">
						Carregar workspace
					</button>
				</form>
				<form className="cycle-form proof-form" onSubmit={createPortfolio}>
					<label>
						<span>Novo portfolio</span>
						<input
							onChange={(event) => setNewPortfolioName(event.target.value)}
							placeholder="Carteira de prova"
							value={newPortfolioName}
						/>
					</label>
					<button className="secondary-action" disabled={!session || busy} type="submit">
						Criar portfolio
					</button>
				</form>
				<details className="fallback-details">
					<summary>Fallback: colar UUID (não é o caminho principal)</summary>
					<label>
						<span>Portfolio ID</span>
						<input
							onChange={(event) => setPortfolioId(event.target.value)}
							placeholder="uuid da carteira"
							value={portfolioId}
						/>
					</label>
				</details>
			</section>

			{message ? (
				<p className={`message ${loadState === loadStates.error ? "error" : ""}`}>{message}</p>
			) : null}

			<section className="proof-section" aria-label="Seed de dados">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Passo 3</p>
						<h2>Asset, preço, posição, caixa e plano</h2>
					</div>
				</div>
				<div className="proof-form-grid">
					<form className="cycle-form proof-form" onSubmit={createAsset}>
						<h3>Asset</h3>
						<label>
							<span>Ticker</span>
							<input
								onChange={(event) => setAssetTicker(event.target.value)}
								required
								value={assetTicker}
							/>
						</label>
						<label>
							<span>Nome</span>
							<input onChange={(event) => setAssetName(event.target.value)} value={assetName} />
						</label>
						<label>
							<span>Tipo</span>
							<select
								onChange={(event) =>
									setAssetType(event.target.value as (typeof assetTypeOptions)[number])
								}
								value={assetType}
							>
								{assetTypeOptions.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Risco</span>
							<select
								onChange={(event) =>
									setRiskCategory(event.target.value as (typeof riskCategoryOptions)[number])
								}
								value={riskCategory}
							>
								{riskCategoryOptions.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<button className="primary-action" disabled={!session || busy} type="submit">
							Criar asset
						</button>
					</form>

					<form className="cycle-form proof-form" onSubmit={createManualPrice}>
						<h3>Preço</h3>
						<label>
							<span>Asset</span>
							<select
								onChange={(event) => setSelectedAssetId(event.target.value)}
								value={selectedAssetId}
							>
								<option value="">Selecione</option>
								{assets.map((asset) => (
									<option key={asset.id} value={asset.id}>
										{asset.ticker} · {asset.name}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Preço manual</span>
							<input
								inputMode="decimal"
								onChange={(event) => setPriceValue(event.target.value)}
								placeholder="100.25"
								required
								value={priceValue}
							/>
						</label>
						<button className="primary-action" disabled={!session || busy} type="submit">
							Gravar snapshot
						</button>
						<button
							className="secondary-action"
							disabled={!session || !selectedAssetId || busy}
							onClick={refreshPriceFromProvider}
							type="button"
						>
							Refresh provider
						</button>
					</form>

					<form className="cycle-form proof-form" onSubmit={createPosition}>
						<h3>Posição</h3>
						<label>
							<span>Asset</span>
							<select
								onChange={(event) => setSelectedAssetId(event.target.value)}
								value={selectedAssetId}
							>
								<option value="">Selecione</option>
								{assets.map((asset) => (
									<option key={asset.id} value={asset.id}>
										{asset.ticker}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Quantidade</span>
							<input
								inputMode="decimal"
								onChange={(event) => setPositionQuantity(event.target.value)}
								required
								value={positionQuantity}
							/>
						</label>
						<label>
							<span>Preço médio</span>
							<input
								inputMode="decimal"
								onChange={(event) => setPositionAveragePrice(event.target.value)}
								required
								value={positionAveragePrice}
							/>
						</label>
						<label>
							<span>Preço manual atual (opcional)</span>
							<input
								inputMode="decimal"
								onChange={(event) => setPositionManualPrice(event.target.value)}
								value={positionManualPrice}
							/>
						</label>
						<button
							className="primary-action"
							disabled={!session || !portfolioId || busy}
							type="submit"
						>
							Criar posição
						</button>
						<p className="hint">
							{positions.length === 0
								? "Nenhuma posição carregada."
								: `${positions.length} posição(ões) no workspace.`}
						</p>
					</form>

					<form className="cycle-form proof-form" onSubmit={createCashAccount}>
						<h3>Caixa</h3>
						<label>
							<span>Nome</span>
							<input onChange={(event) => setCashName(event.target.value)} value={cashName} />
						</label>
						<label>
							<span>Tipo</span>
							<input onChange={(event) => setCashType(event.target.value)} value={cashType} />
						</label>
						<label>
							<span>Saldo</span>
							<input
								inputMode="decimal"
								onChange={(event) => setCashBalance(event.target.value)}
								required
								value={cashBalance}
							/>
						</label>
						<button
							className="primary-action"
							disabled={!session || !portfolioId || busy}
							type="submit"
						>
							Criar conta
						</button>
					</form>

					<form className="cycle-form proof-form" onSubmit={createContributionPlan}>
						<h3>Plano de aporte</h3>
						<label>
							<span>Valor</span>
							<input
								inputMode="decimal"
								onChange={(event) => setPlanAmount(event.target.value)}
								required
								value={planAmount}
							/>
						</label>
						<label>
							<span>Dia do mês</span>
							<input
								inputMode="numeric"
								onChange={(event) => setPlanDayOfMonth(event.target.value)}
								required
								value={planDayOfMonth}
							/>
						</label>
						<label>
							<span>Início (YYYY-MM-DD)</span>
							<input
								onChange={(event) => setPlanStartsAt(event.target.value)}
								required
								value={planStartsAt}
							/>
						</label>
						<label>
							<span>Estratégia padrão</span>
							<select
								onChange={(event) => setPlanStrategyId(event.target.value as StrategyId)}
								value={planStrategyId}
							>
								{strategyOptions.map((strategy) => (
									<option key={strategy.id} value={strategy.id}>
										{strategy.name}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Conta de caixa (opcional)</span>
							<select
								onChange={(event) => setPlanCashAccountId(event.target.value)}
								value={planCashAccountId}
							>
								<option value="">Nenhuma</option>
								{cashAccounts.map((account) => (
									<option key={account.id} value={account.id}>
										{account.name} · {formatCurrency(account.balance)}
									</option>
								))}
							</select>
						</label>
						<button
							className="primary-action"
							disabled={!session || !portfolioId || busy}
							type="submit"
						>
							Criar plano
						</button>
					</form>
				</div>
			</section>

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
					<strong>{confirmedAmountDisplay}</strong>
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
							<p className="eyebrow">Passo 4</p>
							<h2>Ciclo de aporte</h2>
						</div>
						<button
							className="secondary-action"
							disabled={!canCreateCycle || busy}
							onClick={createMonthlyCycle}
							type="button"
						>
							Criar ciclo
						</button>
					</div>

					<form className="cycle-form proof-form" onSubmit={confirmMonthlyCycle}>
						<label>
							<span>Valor confirmado</span>
							<input
								aria-describedby={confirmedAmountError ? confirmedAmountErrorId : undefined}
								aria-invalid={Boolean(confirmedAmountError)}
								inputMode="decimal"
								onChange={(event) => setConfirmedAmount(event.target.value)}
								placeholder="1200.00"
								value={confirmedAmount}
							/>
							{confirmedAmountError ? (
								<small className="field-error" id={confirmedAmountErrorId}>
									{confirmedAmountError}
								</small>
							) : null}
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
						<button className="primary-action" disabled={!canConfirmCycle || busy} type="submit">
							{selectedCycle && !isConfirmableCycle(selectedCycle)
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
							<dd>{nextReviewDate}</dd>
						</div>
						<div>
							<dt>Cadência</dt>
							<dd>{selectedStrategy.reportIntervalDays} dias</dd>
						</div>
						<div>
							<dt>Relatório</dt>
							<dd>
								{visibleReport
									? `#${visibleReport.id.slice(0, 8)} · ${visibleReport.alertCount} alerta(s)`
									: "Ainda não gerado"}
							</dd>
						</div>
					</dl>
					<button
						className="secondary-action wide"
						disabled={!canGenerateReport || busy}
						onClick={generateReport}
						type="button"
					>
						Gerar relatório
					</button>
				</aside>
			</section>

			<section className="proof-section" aria-label="Relatórios">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Passo 5</p>
						<h2>current.json e histórico</h2>
					</div>
					<button
						className="secondary-action"
						disabled={!portfolioId || busy}
						onClick={() => void loadCurrentReport()}
						type="button"
					>
						Carregar current.json
					</button>
				</div>
				{currentReport ? (
					<pre className="json-dump">{JSON.stringify(currentReport, null, 2)}</pre>
				) : (
					<p className="hint">Nenhum current.json carregado ainda.</p>
				)}
				{reportHistory.length === 0 ? (
					<p className="hint">Histórico vazio.</p>
				) : (
					<ul className="report-history-list">
						{reportHistory.map((report) => (
							<li key={report.id}>
								{report.generatedAt} · #{report.id.slice(0, 8)} · {report.alertCount} alerta(s)
								{report.strategyId ? ` · ${report.strategyId}` : ""}
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
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
