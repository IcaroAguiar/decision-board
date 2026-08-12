import { type FormEvent, useEffect, useState } from "react";
import { apiRequest, getErrorMessage } from "./api-client.js";
import {
	type AssetSummary,
	type CashAccount,
	type ContributionPlan,
	formatCurrency,
	normalizeApiBase,
	type PositionSummary,
	type StrategyId,
	strategyIds,
	strategyOptions,
} from "./monthly-contribution.js";

const assetTypeOptions = ["fii", "stock", "etf", "cash", "other"] as const;
const riskCategoryOptions = ["brick", "paper", "hybrid", "cash", "other"] as const;
export interface ProofSeedSectionProps {
	apiBase: string;
	sessionActive: boolean;
	portfolioId: string;
	busy: boolean;
	assets: AssetSummary[];
	cashAccounts: CashAccount[];
	positions: PositionSummary[];
	onBusy: (busy: boolean) => void;
	onMessage: (message: string, error?: boolean) => void;
	onAssetsChange: (assets: AssetSummary[]) => void;
	onCashAccountsChange: (accounts: CashAccount[]) => void;
	onPositionsChange: (positions: PositionSummary[]) => void;
	onPlanCreated: (plan: ContributionPlan) => void;
}

export function ProofSeedSection(props: ProofSeedSectionProps) {
	const {
		apiBase,
		sessionActive,
		portfolioId,
		busy,
		assets,
		cashAccounts,
		positions,
		onBusy,
		onMessage,
		onAssetsChange,
		onCashAccountsChange,
		onPositionsChange,
		onPlanCreated,
	} = props;
	const [assetTicker, setAssetTicker] = useState("");
	const [assetName, setAssetName] = useState("");
	const [assetType, setAssetType] = useState<(typeof assetTypeOptions)[number]>("fii");
	const [riskCategory, setRiskCategory] = useState<(typeof riskCategoryOptions)[number]>("paper");
	const [selectedAssetId, setSelectedAssetId] = useState(assets[0]?.id ?? "");
	const [priceValue, setPriceValue] = useState("");
	const [positionQuantity, setPositionQuantity] = useState("");
	const [positionAveragePrice, setPositionAveragePrice] = useState("");
	const [positionManualPrice, setPositionManualPrice] = useState("");
	const [cashName, setCashName] = useState("Reserva");
	const [cashType, setCashType] = useState("CDB");
	const [cashBalance, setCashBalance] = useState("");
	const [planAmount, setPlanAmount] = useState("1000");
	const [planDayOfMonth, setPlanDayOfMonth] = useState("10");
	const [planStartsAt, setPlanStartsAt] = useState(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
	});
	const [planCashAccountId, setPlanCashAccountId] = useState(cashAccounts[0]?.id ?? "");
	const [planStrategyId, setPlanStrategyId] = useState<StrategyId>(strategyIds.balancedGrowth);

	useEffect(() => {
		if (!selectedAssetId && assets[0]) setSelectedAssetId(assets[0].id);
	}, [assets, selectedAssetId]);
	useEffect(() => {
		if (!planCashAccountId && cashAccounts[0]) setPlanCashAccountId(cashAccounts[0].id);
	}, [cashAccounts, planCashAccountId]);

	async function createAsset(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onBusy(true);
		onMessage("");
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
			onAssetsChange([asset, ...assets.filter((item) => item.id !== asset.id)]);
			setSelectedAssetId(asset.id);
			setAssetTicker("");
			setAssetName("");
			onMessage(`Asset criado: ${asset.ticker}`);
		} catch (error) {
			onMessage(getErrorMessage(error, "Falha ao criar asset."), true);
		} finally {
			onBusy(false);
		}
	}

	async function createManualPrice(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedAssetId) {
			onMessage("Selecione um asset para o snapshot de preço.", true);
			return;
		}
		onBusy(true);
		onMessage("");
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
			onMessage("Snapshot de preço manual gravado.");
		} catch (error) {
			onMessage(getErrorMessage(error, "Falha ao gravar preço."), true);
		} finally {
			onBusy(false);
		}
	}

	async function refreshPriceFromProvider() {
		if (!selectedAssetId) {
			onMessage("Selecione um asset para refresh.", true);
			return;
		}
		onBusy(true);
		onMessage("");
		try {
			const base = normalizeApiBase(apiBase);
			await apiRequest(base, `/assets/${selectedAssetId}/price-snapshots/refresh`, {
				method: "POST",
				body: "{}",
			});
			onMessage("Refresh de provider solicitado.");
		} catch (error) {
			onMessage(getErrorMessage(error, "Falha no refresh de preço."), true);
		} finally {
			onBusy(false);
		}
	}

	async function createPosition(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portfolioId || !selectedAssetId) {
			onMessage("Selecione portfolio e asset antes de criar posição.", true);
			return;
		}
		onBusy(true);
		onMessage("");
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
			onPositionsChange([position, ...positions]);
			onMessage("Posição criada.");
		} catch (error) {
			onMessage(getErrorMessage(error, "Falha ao criar posição."), true);
		} finally {
			onBusy(false);
		}
	}

	async function createCashAccount(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portfolioId) {
			onMessage("Selecione um portfolio antes de criar caixa.", true);
			return;
		}
		onBusy(true);
		onMessage("");
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
			onCashAccountsChange([account, ...cashAccounts]);
			setPlanCashAccountId(account.id);
			onMessage(`Conta de caixa criada: ${account.name}`);
		} catch (error) {
			onMessage(getErrorMessage(error, "Falha ao criar conta de caixa."), true);
		} finally {
			onBusy(false);
		}
	}

	async function createContributionPlan(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portfolioId) {
			onMessage("Selecione um portfolio antes de criar o plano.", true);
			return;
		}
		onBusy(true);
		onMessage("");
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
			onPlanCreated(plan);
			onMessage("Plano de aporte criado.");
		} catch (error) {
			onMessage(getErrorMessage(error, "Falha ao criar plano de aporte."), true);
		} finally {
			onBusy(false);
		}
	}

	return (
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
					<button className="primary-action" disabled={!sessionActive || busy} type="submit">
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
					<button className="primary-action" disabled={!sessionActive || busy} type="submit">
						Gravar snapshot
					</button>
					<button
						className="secondary-action"
						disabled={!sessionActive || !selectedAssetId || busy}
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
						disabled={!sessionActive || !portfolioId || busy}
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
						disabled={!sessionActive || !portfolioId || busy}
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
						disabled={!sessionActive || !portfolioId || busy}
						type="submit"
					>
						Criar plano
					</button>
				</form>
			</div>
		</section>
	);
}
