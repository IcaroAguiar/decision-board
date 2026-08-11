import type { CurrentReportEnvelope, ReportHistoryItem } from "./monthly-contribution.js";

export interface ProofReportsSectionProps {
	busy: boolean;
	portfolioId: string;
	currentReport: CurrentReportEnvelope | null;
	reportHistory: ReportHistoryItem[];
	onLoadCurrentReport: () => void;
}

export function ProofReportsSection(props: ProofReportsSectionProps) {
	return (
		<section className="proof-section" aria-label="Relatórios">
			<div className="section-heading">
				<div>
					<p className="eyebrow">Passo 5</p>
					<h2>current.json e histórico</h2>
				</div>
				<button
					className="secondary-action"
					disabled={!props.portfolioId || props.busy}
					onClick={props.onLoadCurrentReport}
					type="button"
				>
					Carregar current.json
				</button>
			</div>
			{props.currentReport ? (
				<pre className="json-dump">{JSON.stringify(props.currentReport, null, 2)}</pre>
			) : (
				<p className="hint">Nenhum current.json carregado ainda.</p>
			)}
			{props.reportHistory.length === 0 ? (
				<p className="hint">Histórico vazio.</p>
			) : (
				<ul className="report-history-list">
					{props.reportHistory.map((report) => (
						<li key={report.id}>
							{report.generatedAt} · #{report.id.slice(0, 8)} · {report.alertCount} alerta(s)
							{report.strategyId ? ` · ${report.strategyId}` : ""}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
