import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Inject,
	Param,
	Patch,
	Post,
	Req,
	Res,
} from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseCreatePortfolioDto,
	parsePortfolioId,
	parseUpdatePortfolioDto,
} from "./portfolio.dto.js";
import { type PortfolioResponse, PortfoliosService } from "./portfolios.service.js";

@Controller("portfolios")
export class PortfoliosController {
	constructor(@Inject(PortfoliosService) private readonly portfolios: PortfoliosService) {}

	@Post()
	async createPortfolio(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Body() body: unknown,
	): Promise<PortfolioResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.portfolios.createPortfolio(user.userId, parseCreatePortfolioDto(body));
	}

	@Get()
	async listPortfolios(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
	): Promise<PortfolioResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.portfolios.listPortfolios(user.userId);
	}

	@Get(":portfolioId")
	async getPortfolio(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<PortfolioResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.portfolios.getPortfolio(user.userId, parsePortfolioId(portfolioId));
	}

	@Patch(":portfolioId")
	async updatePortfolio(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Body() body: unknown,
	): Promise<PortfolioResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.portfolios.updatePortfolio(
			user.userId,
			parsePortfolioId(portfolioId),
			parseUpdatePortfolioDto(body),
		);
	}

	@Delete(":portfolioId")
	@HttpCode(204)
	async deletePortfolio(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<void> {
		const user = await requireAuthenticatedUser(request, response);
		await this.portfolios.deletePortfolio(user.userId, parsePortfolioId(portfolioId));
	}
}
