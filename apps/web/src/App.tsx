import { useId } from "react";

const dashboardQuestions = [
	"Valor total da carteira",
	"Caixa disponível",
	"Aporte deste mês",
	"Estratégia ativa",
	"Alertas importantes",
	"Próximo relatório",
];

export function App() {
	const dashboardTitleId = useId();

	return (
		<main className="app-shell">
			<section className="dashboard-panel" aria-labelledby={dashboardTitleId}>
				<p className="eyebrow">Portfolio Decision Dashboard</p>
				<h1 id={dashboardTitleId}>Decision Board</h1>
				<p className="summary">
					Organize sua carteira, acompanhe aportes e gere relatórios estruturados sem automação de
					corretora ou recomendação prescritiva.
				</p>
				<div className="question-grid">
					{dashboardQuestions.map((question) => (
						<article className="metric-card" key={question}>
							<span>{question}</span>
							<strong>A configurar</strong>
						</article>
					))}
				</div>
			</section>
		</main>
	);
}
