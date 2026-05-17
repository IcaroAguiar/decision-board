import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { type Position, Prisma } from "@prisma/client";
import type { CreatePositionResult, PositionRepository } from "./position.repository.js";
import { PositionsService } from "./positions.service.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PORTFOLIO_ID = "00000000-0000-4000-8000-000000000002";
const POSITION_ID = "00000000-0000-4000-8000-000000000003";
const ASSET_ID = "00000000-0000-4000-8000-000000000004";
const CREATED_AT = new Date("2099-03-01T00:00:00.000Z");
const UPDATED_AT = new Date("2099-03-02T00:00:00.000Z");

type FakePositionRepository = Pick<
	PositionRepository,
	"createByUser" | "findManyByPortfolio" | "updateByUser"
>;

function createPosition(overrides: Partial<Position> = {}): Position {
	return {
		id: POSITION_ID,
		userId: USER_ID,
		portfolioId: PORTFOLIO_ID,
		assetId: ASSET_ID,
		quantity: new Prisma.Decimal("10"),
		averagePrice: null,
		manualCurrentPrice: null,
		source: "MANUAL",
		notes: null,
		createdAt: CREATED_AT,
		updatedAt: UPDATED_AT,
		...overrides,
	};
}

function createService(repository: FakePositionRepository): PositionsService {
	return new PositionsService(repository as PositionRepository);
}

test("maps positions without manual price to null current price and total value", async () => {
	const repository: FakePositionRepository = {
		async createByUser(): Promise<CreatePositionResult> {
			return {
				status: "created",
				position: createPosition({
					quantity: new Prisma.Decimal("2.5"),
					averagePrice: new Prisma.Decimal("90"),
					manualCurrentPrice: null,
					notes: "sem preco manual",
				}),
			};
		},
		async findManyByPortfolio(): Promise<Position[]> {
			return [
				createPosition({
					quantity: new Prisma.Decimal("1.5"),
					manualCurrentPrice: null,
				}),
			];
		},
		async updateByUser(): Promise<Position | null> {
			return createPosition({
				quantity: new Prisma.Decimal("3"),
				manualCurrentPrice: new Prisma.Decimal("101.5"),
			});
		},
	};
	const service = createService(repository);

	const created = await service.createPosition(USER_ID, PORTFOLIO_ID, {
		assetId: ASSET_ID,
		quantity: "2.5",
	});
	const listed = await service.listPositions(USER_ID, PORTFOLIO_ID);
	const updated = await service.updatePosition(USER_ID, POSITION_ID, {
		manualCurrentPrice: "101.5",
	});

	assert.equal(created.averagePrice, "90");
	assert.equal(created.manualCurrentPrice, null);
	assert.equal(created.currentPrice, null);
	assert.equal(created.totalValue, null);
	assert.equal(created.notes, "sem preco manual");
	assert.equal(listed[0]?.currentPrice, null);
	assert.equal(listed[0]?.totalValue, null);
	assert.equal(updated.currentPrice, "101.5");
	assert.equal(updated.totalValue, "304.5");
});

test("translates repository misses to not found errors", async () => {
	const repository: FakePositionRepository = {
		async createByUser(): Promise<CreatePositionResult> {
			return {
				status: "not-found",
			};
		},
		async findManyByPortfolio(): Promise<Position[] | null> {
			return null;
		},
		async updateByUser(): Promise<Position | null> {
			return null;
		},
	};
	const service = createService(repository);

	await assert.rejects(
		service.createPosition(USER_ID, PORTFOLIO_ID, {
			assetId: ASSET_ID,
			quantity: "1",
		}),
		NotFoundException,
	);
	await assert.rejects(service.listPositions(USER_ID, PORTFOLIO_ID), NotFoundException);
	await assert.rejects(
		service.updatePosition(USER_ID, POSITION_ID, {
			quantity: "1",
		}),
		NotFoundException,
	);
});
