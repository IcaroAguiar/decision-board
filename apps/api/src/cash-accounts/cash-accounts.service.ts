import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CashAccount } from "@prisma/client";
import type { CreateCashAccountDto, UpdateCashAccountDto } from "./cash-account.dto.js";
import { CashAccountRepository } from "./cash-account.repository.js";

export interface CashAccountResponse {
	id: string;
	portfolioId: string;
	name: string;
	type: string;
	balance: string;
	liquidity: string | null;
	benchmark: string | null;
	benchmarkPercent: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

@Injectable()
export class CashAccountsService {
	constructor(
		@Inject(CashAccountRepository) private readonly cashAccounts: CashAccountRepository,
	) {}

	async createCashAccount(
		userId: string,
		portfolioId: string,
		data: CreateCashAccountDto,
	): Promise<CashAccountResponse> {
		const result = await this.cashAccounts.createByUser(userId, portfolioId, data);

		if (result.status === "not-found") {
			throw new NotFoundException("Portfolio not found");
		}

		return toCashAccountResponse(result.cashAccount);
	}

	async listCashAccounts(userId: string, portfolioId: string): Promise<CashAccountResponse[]> {
		const cashAccounts = await this.cashAccounts.findManyByPortfolio(userId, portfolioId);

		if (!cashAccounts) {
			throw new NotFoundException("Portfolio not found");
		}

		return cashAccounts.map(toCashAccountResponse);
	}

	async updateCashAccount(
		userId: string,
		cashAccountId: string,
		data: UpdateCashAccountDto,
	): Promise<CashAccountResponse> {
		const cashAccount = await this.cashAccounts.updateByUser(userId, cashAccountId, data);

		if (!cashAccount) {
			throw new NotFoundException("Cash account not found");
		}

		return toCashAccountResponse(cashAccount);
	}
}

function toCashAccountResponse(cashAccount: CashAccount): CashAccountResponse {
	return {
		id: cashAccount.id,
		portfolioId: cashAccount.portfolioId,
		name: cashAccount.name,
		type: cashAccount.type,
		balance: cashAccount.balance.toString(),
		liquidity: cashAccount.liquidity,
		benchmark: cashAccount.benchmark,
		benchmarkPercent: cashAccount.benchmarkPercent?.toString() ?? null,
		notes: cashAccount.notes,
		createdAt: cashAccount.createdAt.toISOString(),
		updatedAt: cashAccount.updatedAt.toISOString(),
	};
}
