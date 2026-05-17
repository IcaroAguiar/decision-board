import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AssetType, RiskCategory } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import { PositionRepository } from "./position.repository.js";

const TEST_EMAIL_PREFIX = "test-position-repository-";
const CREATED_STATUS = "created";
const NOT_FOUND_STATUS = "not-found";
const EARLIER_CREATED_AT = new Date("2099-02-01T00:00:00.000Z");
const LATER_CREATED_AT = new Date("2099-02-01T00:00:01.000Z");

function uniqueTicker(prefix: string): string {
	return `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
	const email = `${TEST_EMAIL_PREFIX}${label}-${randomUUID()}@example.com`;

	return prisma.user.create({
		data: {
			email,
			emailVerified: true,
		},
		select: {
			id: true,
			email: true,
		},
	});
}

async function createPortfolio(userId: string, name: string): Promise<{ id: string }> {
	return prisma.portfolio.create({
		data: {
			userId,
			name,
		},
		select: {
			id: true,
		},
	});
}

async function createAsset(ticker: string): Promise<{ id: string }> {
	return prisma.asset.create({
		data: {
			ticker,
			name: `${ticker} Position Repository`,
			assetType: AssetType.FII,
			riskCategory: RiskCategory.PAPER,
			currency: "BRL",
			exchange: "B3",
		},
		select: {
			id: true,
		},
	});
}

test("scopes position repository creation, listing, and updates by user", async () => {
	const repository = new PositionRepository();
	const userA = await createUser("a");
	const userB = await createUser("b");
	const portfolioA = await createPortfolio(userA.id, "Position repository A");
	const portfolioB = await createPortfolio(userB.id, "Position repository B");
	const assetA = await createAsset(uniqueTicker("PRA"));
	const assetB = await createAsset(uniqueTicker("PRB"));

	try {
		const missingPortfolio = await repository.createByUser(userA.id, portfolioB.id, {
			assetId: assetA.id,
			quantity: "1",
		});
		assert.equal(missingPortfolio.status, NOT_FOUND_STATUS);

		const missingAsset = await repository.createByUser(userA.id, portfolioA.id, {
			assetId: randomUUID(),
			quantity: "1",
		});
		assert.equal(missingAsset.status, NOT_FOUND_STATUS);

		const laterPosition = await repository.createByUser(userA.id, portfolioA.id, {
			assetId: assetA.id,
			quantity: "10.5",
			averagePrice: "90",
			manualCurrentPrice: "100.25",
			notes: "entrada manual",
		});
		assert.equal(laterPosition.status, CREATED_STATUS);

		const earlierPosition = await repository.createByUser(userA.id, portfolioA.id, {
			assetId: assetB.id,
			quantity: "2",
			averagePrice: null,
			manualCurrentPrice: null,
			notes: null,
		});
		assert.equal(earlierPosition.status, CREATED_STATUS);

		await prisma.position.update({
			where: {
				id: laterPosition.position.id,
			},
			data: {
				createdAt: LATER_CREATED_AT,
			},
		});
		await prisma.position.update({
			where: {
				id: earlierPosition.position.id,
			},
			data: {
				createdAt: EARLIER_CREATED_AT,
			},
		});

		const ownPositions = await repository.findManyByPortfolio(userA.id, portfolioA.id);
		assert.deepEqual(
			ownPositions?.map((position) => position.id),
			[earlierPosition.position.id, laterPosition.position.id],
		);
		assert.equal(ownPositions?.[0]?.manualCurrentPrice, null);
		assert.equal(ownPositions?.[1]?.quantity.toString(), "10.5");
		assert.equal(ownPositions?.[1]?.averagePrice?.toString(), "90");
		assert.equal(ownPositions?.[1]?.manualCurrentPrice?.toString(), "100.25");
		assert.equal(await repository.findManyByPortfolio(userB.id, portfolioA.id), null);

		assert.equal(
			(await repository.findByUser(userA.id, laterPosition.position.id))?.id,
			laterPosition.position.id,
		);
		assert.equal(await repository.findByUser(userB.id, laterPosition.position.id), null);

		const updateOtherUser = await repository.updateByUser(userB.id, laterPosition.position.id, {
			quantity: "1",
		});
		assert.equal(updateOtherUser, null);

		const updatedPosition = await repository.updateByUser(userA.id, laterPosition.position.id, {
			quantity: "12.25",
			averagePrice: null,
			manualCurrentPrice: "101.5",
			notes: null,
		});
		assert.equal(updatedPosition?.quantity.toString(), "12.25");
		assert.equal(updatedPosition?.averagePrice, null);
		assert.equal(updatedPosition?.manualCurrentPrice?.toString(), "101.5");
		assert.equal(updatedPosition?.notes, null);
	} finally {
		await prisma.user.deleteMany({
			where: {
				email: {
					in: [userA.email, userB.email],
				},
			},
		});
		await prisma.asset.deleteMany({
			where: {
				id: {
					in: [assetA.id, assetB.id],
				},
			},
		});
		await prisma.$disconnect();
	}
});
