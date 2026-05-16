import { Body, Controller, Get, Inject, Param, Patch, Post, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseCashAccountId,
	parseCashAccountPortfolioId,
	parseCreateCashAccountDto,
	parseUpdateCashAccountDto,
} from "./cash-account.dto.js";
import { type CashAccountResponse, CashAccountsService } from "./cash-accounts.service.js";

@Controller()
export class CashAccountsController {
	constructor(@Inject(CashAccountsService) private readonly cashAccounts: CashAccountsService) {}

	@Post("portfolios/:portfolioId/cash-accounts")
	async createCashAccount(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
		@Body() body: unknown,
	): Promise<CashAccountResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.cashAccounts.createCashAccount(
			user.userId,
			parseCashAccountPortfolioId(portfolioId),
			parseCreateCashAccountDto(body),
		);
	}

	@Get("portfolios/:portfolioId/cash-accounts")
	async listCashAccounts(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("portfolioId") portfolioId: string,
	): Promise<CashAccountResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.cashAccounts.listCashAccounts(
			user.userId,
			parseCashAccountPortfolioId(portfolioId),
		);
	}

	@Patch("cash-accounts/:cashAccountId")
	async updateCashAccount(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("cashAccountId") cashAccountId: string,
		@Body() body: unknown,
	): Promise<CashAccountResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.cashAccounts.updateCashAccount(
			user.userId,
			parseCashAccountId(cashAccountId),
			parseUpdateCashAccountDto(body),
		);
	}
}
