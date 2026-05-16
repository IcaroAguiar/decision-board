import { Body, Controller, Get, Inject, Param, Patch, Post, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseCreatePositionDto,
	parsePositionId,
	parsePositionPortfolioId,
	parseUpdatePositionDto,
} from "./position.dto.js";
import { type PositionResponse, PositionsService } from "./positions.service.js";

@Controller()
export class PositionsController {
	constructor(@Inject(PositionsService) private readonly positions: PositionsService) {}

	@Post("portfolios/:portfolioId/positions")
	async createPosition(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Body() body: unknown,
	): Promise<PositionResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.positions.createPosition(
			user.userId,
			parsePositionPortfolioId(portfolioId),
			parseCreatePositionDto(body),
		);
	}

	@Get("portfolios/:portfolioId/positions")
	async listPositions(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<PositionResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.positions.listPositions(user.userId, parsePositionPortfolioId(portfolioId));
	}

	@Patch("positions/:positionId")
	async updatePosition(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("positionId") positionId: string,
		@Body() body: unknown,
	): Promise<PositionResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.positions.updatePosition(
			user.userId,
			parsePositionId(positionId),
			parseUpdatePositionDto(body),
		);
	}
}
