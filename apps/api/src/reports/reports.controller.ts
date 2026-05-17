import { Controller, Get, Header, Inject, Param, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import { parsePortfolioId } from "../portfolios/portfolio.dto.js";
import { ReportsService } from "./reports.service.js";

const CURRENT_JSON_REPORT_ROUTE = "current.json";
const CURRENT_MARKDOWN_REPORT_ROUTE = "current.md";
const MARKDOWN_REPORT_CONTENT_TYPE = "text/markdown; charset=utf-8";

@Controller("portfolios/:portfolioId/reports")
export class ReportsController {
	constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

	@Get(CURRENT_JSON_REPORT_ROUTE)
	async exportJsonReport(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	) {
		const user = await requireAuthenticatedUser(request, response);
		const report = await this.reports.exportPortfolioReport(
			user.userId,
			parsePortfolioId(portfolioId),
		);

		return report.json;
	}

	@Get(CURRENT_MARKDOWN_REPORT_ROUTE)
	@Header("content-type", MARKDOWN_REPORT_CONTENT_TYPE)
	async exportMarkdownReport(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<string> {
		const user = await requireAuthenticatedUser(request, response);
		const report = await this.reports.exportPortfolioReport(
			user.userId,
			parsePortfolioId(portfolioId),
		);

		return report.markdown;
	}
}
