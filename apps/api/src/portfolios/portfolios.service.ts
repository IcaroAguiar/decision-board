import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Portfolio } from "@prisma/client";
import type { CreatePortfolioDto, UpdatePortfolioDto } from "./portfolio.dto.js";
import { PortfolioRepository } from "./portfolio.repository.js";

export interface PortfolioResponse {
	id: string;
	name: string;
	baseCurrency: string;
	createdAt: string;
	updatedAt: string;
}

@Injectable()
export class PortfoliosService {
	constructor(@Inject(PortfolioRepository) private readonly portfolios: PortfolioRepository) {}

	async createPortfolio(userId: string, data: CreatePortfolioDto): Promise<PortfolioResponse> {
		return toPortfolioResponse(await this.portfolios.create(userId, data));
	}

	async listPortfolios(userId: string): Promise<PortfolioResponse[]> {
		const portfolios = await this.portfolios.findManyByUser(userId);
		return portfolios.map(toPortfolioResponse);
	}

	async getPortfolio(userId: string, portfolioId: string): Promise<PortfolioResponse> {
		const portfolio = await this.portfolios.findByUser(userId, portfolioId);

		if (!portfolio) {
			throw new NotFoundException("Portfolio not found");
		}

		return toPortfolioResponse(portfolio);
	}

	async updatePortfolio(
		userId: string,
		portfolioId: string,
		data: UpdatePortfolioDto,
	): Promise<PortfolioResponse> {
		const portfolio = await this.portfolios.updateByUser(userId, portfolioId, data);

		if (!portfolio) {
			throw new NotFoundException("Portfolio not found");
		}

		return toPortfolioResponse(portfolio);
	}

	async deletePortfolio(userId: string, portfolioId: string): Promise<void> {
		const result = await this.portfolios.deleteEmptyByUser(userId, portfolioId);

		if (result === "not-found") {
			throw new NotFoundException("Portfolio not found");
		}

		if (result === "not-empty") {
			throw new ConflictException("Only empty portfolios can be deleted");
		}
	}
}

function toPortfolioResponse(portfolio: Portfolio): PortfolioResponse {
	return {
		id: portfolio.id,
		name: portfolio.name,
		baseCurrency: portfolio.baseCurrency,
		createdAt: portfolio.createdAt.toISOString(),
		updatedAt: portfolio.updatedAt.toISOString(),
	};
}
