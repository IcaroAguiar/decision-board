import { Body, Controller, Get, Inject, Param, Patch, Post, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseContributionCycleId,
	parseContributionCyclePlanId,
	parseContributionCyclePortfolioId,
	parseCreateContributionCycleDto,
	parseUpdateContributionCycleDto,
} from "./contribution-cycle.dto.js";
import {
	type ContributionCycleResponse,
	ContributionCyclesService,
} from "./contribution-cycles.service.js";

@Controller()
export class ContributionCyclesController {
	constructor(
		@Inject(ContributionCyclesService)
		private readonly contributionCycles: ContributionCyclesService,
	) {}

	@Post("contribution-plans/:contributionPlanId/cycles")
	async createContributionCycle(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("contributionPlanId") contributionPlanId: string,
		@Body() body: unknown,
	): Promise<ContributionCycleResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.contributionCycles.createContributionCycle(
			user.userId,
			parseContributionCyclePlanId(contributionPlanId),
			parseCreateContributionCycleDto(body),
		);
	}

	@Get("portfolios/:portfolioId/contribution-cycles")
	async listContributionCycles(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<ContributionCycleResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.contributionCycles.listContributionCycles(
			user.userId,
			parseContributionCyclePortfolioId(portfolioId),
		);
	}

	@Patch("contribution-cycles/:contributionCycleId")
	async updateContributionCycle(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("contributionCycleId") contributionCycleId: string,
		@Body() body: unknown,
	): Promise<ContributionCycleResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.contributionCycles.updateContributionCycle(
			user.userId,
			parseContributionCycleId(contributionCycleId),
			parseUpdateContributionCycleDto(body),
		);
	}
}
