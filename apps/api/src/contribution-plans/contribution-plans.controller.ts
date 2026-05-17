import { Body, Controller, Get, Inject, Param, Patch, Post, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseContributionPlanId,
	parseContributionPlanPortfolioId,
	parseCreateContributionPlanDto,
	parseUpdateContributionPlanDto,
} from "./contribution-plan.dto.js";
import {
	type ContributionPlanResponse,
	ContributionPlansService,
} from "./contribution-plans.service.js";

@Controller()
export class ContributionPlansController {
	constructor(
		@Inject(ContributionPlansService)
		private readonly contributionPlans: ContributionPlansService,
	) {}

	@Post("portfolios/:portfolioId/contribution-plans")
	async createContributionPlan(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Body() body: unknown,
	): Promise<ContributionPlanResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.contributionPlans.createContributionPlan(
			user.userId,
			parseContributionPlanPortfolioId(portfolioId),
			parseCreateContributionPlanDto(body),
		);
	}

	@Get("portfolios/:portfolioId/contribution-plans")
	async listActiveContributionPlans(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<ContributionPlanResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.contributionPlans.listActiveContributionPlans(
			user.userId,
			parseContributionPlanPortfolioId(portfolioId),
		);
	}

	@Patch("contribution-plans/:contributionPlanId")
	async updateContributionPlan(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("contributionPlanId") contributionPlanId: string,
		@Body() body: unknown,
	): Promise<ContributionPlanResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.contributionPlans.updateContributionPlan(
			user.userId,
			parseContributionPlanId(contributionPlanId),
			parseUpdateContributionPlanDto(body),
		);
	}
}
