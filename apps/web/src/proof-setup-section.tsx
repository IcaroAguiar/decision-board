import type { FormEvent } from "react";
import {
	type ContributionPlan,
	normalizeApiBase,
	type PortfolioSummary,
	type SessionUser,
} from "./monthly-contribution.js";
import { persistWorkspace } from "./proof-storage.js";

export interface ProofSetupSectionProps {
	apiBase: string;
	setApiBase: (value: string) => void;
	session: SessionUser | null;
	sessionKnown: boolean;
	busy: boolean;
	authName: string;
	setAuthName: (value: string) => void;
	authEmail: string;
	setAuthEmail: (value: string) => void;
	authPassword: string;
	setAuthPassword: (value: string) => void;
	signUp: (event: FormEvent<HTMLFormElement>) => void;
	signIn: (event: FormEvent<HTMLFormElement>) => void;
	signOut: () => void;
	portfolios: PortfolioSummary[];
	portfolioId: string;
	setPortfolioId: (value: string) => void;
	contributionPlanId: string;
	setContributionPlanId: (value: string) => void;
	plans: ContributionPlan[];
	newPortfolioName: string;
	setNewPortfolioName: (value: string) => void;
	canLoad: boolean;
	loadPortfolios: () => void;
	loadContributionWorkspace: (event?: FormEvent<HTMLFormElement>) => void;
	createPortfolio: (event: FormEvent<HTMLFormElement>) => void;
}

export function ProofSetupSection(props: ProofSetupSectionProps) {
	return (
		<>
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
						onChange={(event) => props.setApiBase(event.target.value)}
						placeholder="http://localhost:3001"
						value={props.apiBase}
					/>
				</label>
				<p className="hint">
					{props.sessionKnown
						? props.session
							? `Sessão: ${props.session.email}`
							: "Sem sessão. Use sign-up ou sign-in."
						: "Verificando sessão…"}
				</p>
				{props.session ? (
					<button
						className="secondary-action"
						disabled={props.busy}
						onClick={props.signOut}
						type="button"
					>
						Sign out
					</button>
				) : (
					<div className="proof-form-grid">
						<form className="cycle-form proof-form" onSubmit={props.signUp}>
							<label>
								<span>Nome (sign-up)</span>
								<input
									onChange={(event) => props.setAuthName(event.target.value)}
									required
									value={props.authName}
								/>
							</label>
							<label>
								<span>E-mail</span>
								<input
									autoComplete="username"
									onChange={(event) => props.setAuthEmail(event.target.value)}
									required
									type="email"
									value={props.authEmail}
								/>
							</label>
							<label>
								<span>Senha</span>
								<input
									autoComplete="new-password"
									onChange={(event) => props.setAuthPassword(event.target.value)}
									required
									type="password"
									value={props.authPassword}
								/>
							</label>
							<button className="primary-action" disabled={props.busy} type="submit">
								Sign up
							</button>
						</form>
						<form className="cycle-form proof-form" onSubmit={props.signIn}>
							<label>
								<span>E-mail</span>
								<input
									autoComplete="username"
									onChange={(event) => props.setAuthEmail(event.target.value)}
									required
									type="email"
									value={props.authEmail}
								/>
							</label>
							<label>
								<span>Senha</span>
								<input
									autoComplete="current-password"
									onChange={(event) => props.setAuthPassword(event.target.value)}
									required
									type="password"
									value={props.authPassword}
								/>
							</label>
							<button className="primary-action" disabled={props.busy} type="submit">
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
						disabled={!props.session || props.busy}
						onClick={props.loadPortfolios}
						type="button"
					>
						Atualizar lista
					</button>
				</div>
				<form className="setup-band" onSubmit={props.loadContributionWorkspace}>
					<label>
						<span>Carteira</span>
						<select
							disabled={!props.session || props.portfolios.length === 0}
							onChange={(event) => {
								props.setPortfolioId(event.target.value);
								persistWorkspace(
									normalizeApiBase(props.apiBase),
									event.target.value,
									props.contributionPlanId,
								);
							}}
							value={props.portfolioId}
						>
							{props.portfolios.length === 0 ? (
								<option value="">Nenhum portfolio — crie um abaixo</option>
							) : (
								props.portfolios.map((portfolio) => (
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
							onChange={(event) => props.setContributionPlanId(event.target.value)}
							value={props.contributionPlanId}
						>
							<option value="">Primeiro plano ativo</option>
							{props.plans.map((plan) => (
								<option key={plan.id} value={plan.id}>
									{plan.amount} · {plan.defaultStrategyId}
								</option>
							))}
						</select>
					</label>
					<button className="primary-action" disabled={!props.canLoad || props.busy} type="submit">
						Carregar workspace
					</button>
				</form>
				<form className="cycle-form proof-form" onSubmit={props.createPortfolio}>
					<label>
						<span>Novo portfolio</span>
						<input
							onChange={(event) => props.setNewPortfolioName(event.target.value)}
							placeholder="Carteira de prova"
							value={props.newPortfolioName}
						/>
					</label>
					<button
						className="secondary-action"
						disabled={!props.session || props.busy}
						type="submit"
					>
						Criar portfolio
					</button>
				</form>
				<details className="fallback-details">
					<summary>Fallback: colar UUID (não é o caminho principal)</summary>
					<label>
						<span>Portfolio ID</span>
						<input
							onChange={(event) => props.setPortfolioId(event.target.value)}
							placeholder="uuid da carteira"
							value={props.portfolioId}
						/>
					</label>
				</details>
			</section>
		</>
	);
}
