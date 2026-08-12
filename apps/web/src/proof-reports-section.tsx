import { apiRequest, getErrorMessage } from "./api-client.js";
import {
	type CurrentReportEnvelope,
	normalizeApiBase,
	type ReportHistoryItem,
} from "./monthly-contribution.js";

export interface ProofReportsSectionProps {
	apiBase: string;
	busy: boolean;
	portfolioId: string;
	currentReport: CurrentReportEnvelope | null;
	reportHistory: ReportHistoryItem[];
	onBusy: (busy: boolean) => void;
	onCurrentReportChange: (report: CurrentReportEnvelope) => void;
	onMessage: (message: string, error?: boolean) => void;
}

export function ProofReportsSection(props: ProofReportsSectionProps) {
	async function loadCurrentReport() {
		if (!props.portfolioId) {
			props.onMessage("Selecione um portfolio para carregar current.json.", true);
			return;
		}
		props.onBusy(true);
		props.onMessage("");
		try {
			const envelope = await apiRequest<CurrentReportEnvelope>(
				normalizeApiBase(props.apiBase),
				`/portfolios/${props.portfolioId}/reports/current.json`,
			);
			props.onCurrentReportChange(envelope);
			props.onMessage("current.json carregado.");
		} catch (error) {
			props.onMessage(getErrorMessage(error, "Falha ao carregar current.json."), true);
		} finally {
			props.onBusy(false);
		}
	}

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
					onClick={() => void loadCurrentReport()}
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
