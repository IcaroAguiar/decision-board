import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Position, Prisma } from "@prisma/client";
import type { CreatePositionDto, UpdatePositionDto } from "./position.dto.js";
import { PositionRepository } from "./position.repository.js";

export interface PositionResponse {
	id: string;
	portfolioId: string;
	assetId: string;
	quantity: string;
	averagePrice: string | null;
	manualCurrentPrice: string | null;
	currentPrice: string | null;
	totalValue: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

@Injectable()
export class PositionsService {
	constructor(@Inject(PositionRepository) private readonly positions: PositionRepository) {}

	async createPosition(
		userId: string,
		portfolioId: string,
		data: CreatePositionDto,
	): Promise<PositionResponse> {
		const result = await this.positions.createByUser(userId, portfolioId, data);

		if (result.status === "not-found") {
			throw new NotFoundException("Portfolio or asset not found");
		}

		return toPositionResponse(result.position);
	}

	async listPositions(userId: string, portfolioId: string): Promise<PositionResponse[]> {
		const positions = await this.positions.findManyByPortfolio(userId, portfolioId);

		if (!positions) {
			throw new NotFoundException("Portfolio not found");
		}

		return positions.map(toPositionResponse);
	}

	async updatePosition(
		userId: string,
		positionId: string,
		data: UpdatePositionDto,
	): Promise<PositionResponse> {
		const position = await this.positions.updateByUser(userId, positionId, data);

		if (!position) {
			throw new NotFoundException("Position not found");
		}

		return toPositionResponse(position);
	}
}

function toPositionResponse(position: Position): PositionResponse {
	const currentPrice = position.manualCurrentPrice;
	const totalValue = currentPrice ? new Prisma.Decimal(position.quantity).mul(currentPrice) : null;

	return {
		id: position.id,
		portfolioId: position.portfolioId,
		assetId: position.assetId,
		quantity: position.quantity.toString(),
		averagePrice: position.averagePrice?.toString() ?? null,
		manualCurrentPrice: position.manualCurrentPrice?.toString() ?? null,
		currentPrice: currentPrice?.toString() ?? null,
		totalValue: totalValue?.toString() ?? null,
		notes: position.notes,
		createdAt: position.createdAt.toISOString(),
		updatedAt: position.updatedAt.toISOString(),
	};
}
