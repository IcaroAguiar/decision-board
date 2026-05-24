import { Body, Controller, Get, Header, Inject, Param, Post, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import { parsePortfolioId } from "../portfolios/portfolio.dto.js";
import { parseCreateSavedReportDto, parseReportId } from "./report.dto.js";
import { ReportsService } from "./reports.service.js";

const CURRENT_JSON_REPORT_ROUTE = "current.json";
const CURRENT_MARKDOWN_REPORT_ROUTE = "current.md";
const MARKDOWN_REPORT_CONTENT_TYPE = "text/markdown; charset=utf-8";

@Controller("portfolios/:portfolioId/reports")
export class ReportsController {
	constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

	@Post()
	async createSavedReport(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Body() body: unknown,
	) {
		const user = await requireAuthenticatedUser(request, response);
		return this.reports.createSavedReport(
			user.userId,
			parsePortfolioId(portfolioId),
			parseCreateSavedReportDto(body),
		);
	}

	@Get()
	async listSavedReports(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	) {
		const user = await requireAuthenticatedUser(request, response);
		return this.reports.listSavedReports(user.userId, parsePortfolioId(portfolioId));
	}

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

	@Get(":reportId.json")
	async getSavedJsonReport(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Param("reportId") reportId: string,
	) {
		const user = await requireAuthenticatedUser(request, response);
		const report = await this.reports.getSavedReport(
			user.userId,
			parsePortfolioId(portfolioId),
			parseReportId(reportId),
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

	@Get(":reportId.md")
	@Header("content-type", MARKDOWN_REPORT_CONTENT_TYPE)
	async getSavedMarkdownReport(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Param("reportId") reportId: string,
	): Promise<string> {
		const user = await requireAuthenticatedUser(request, response);
		const report = await this.reports.getSavedReport(
			user.userId,
			parsePortfolioId(portfolioId),
			parseReportId(reportId),
		);

		return report.markdown;
	}
}
