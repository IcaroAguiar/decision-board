import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AssetType, RiskCategory } from "@prisma/client";
import { prisma } from "../auth/prisma.client.js";
import { AssetRepository } from "./asset.repository.js";

function uniqueTicker(prefix: string): string {
	return `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
}

async function createTestUser(label: string): Promise<{ id: string; email: string }> {
	const email = `${label}-${randomUUID()}@example.test`;

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

test("finds active assets with only the requesting user's override", async () => {
	const repository = new AssetRepository();
	const userA = await createTestUser("asset-repository-a");
	const userB = await createTestUser("asset-repository-b");
	const ticker = uniqueTicker("AR");
	const inactiveTicker = uniqueTicker("ARI");
	const createdAssetIds: string[] = [];

	try {
		const activeAsset = await prisma.asset.create({
			data: {
				ticker,
				name: "Alpha Repository Income",
				assetType: AssetType.FII,
				riskCategory: RiskCategory.PAPER,
				segment: "recebiveis",
				currency: "BRL",
				exchange: "B3",
			},
		});
		createdAssetIds.push(activeAsset.id);

		const inactiveAsset = await prisma.asset.create({
			data: {
				ticker: inactiveTicker,
				name: "Alpha Repository Inactive",
				assetType: AssetType.FII,
				riskCategory: RiskCategory.PAPER,
				currency: "BRL",
				exchange: "B3",
				isActive: false,
			},
		});
		createdAssetIds.push(inactiveAsset.id);

		await prisma.userAssetOverride.createMany({
			data: [
				{
					userId: userA.id,
					assetId: activeAsset.id,
					customName: "Minha visao alpha",
					customAssetType: AssetType.ETF,
				},
				{
					userId: userB.id,
					assetId: activeAsset.id,
					customName: "Visao de outro usuario",
					customRiskCategory: RiskCategory.BRICK,
				},
			],
		});

		const assetsByQuery = await repository.findManyForUser(userA.id, {
			q: "alpha repository",
			limit: 10,
		});

		assert.deepEqual(
			assetsByQuery.map((asset) => asset.id),
			[activeAsset.id],
		);
		assert.equal(assetsByQuery[0]?.userAssetOverrides.length, 1);
		assert.equal(assetsByQuery[0]?.userAssetOverrides[0]?.userId, userA.id);
		assert.equal(assetsByQuery[0]?.userAssetOverrides[0]?.customName, "Minha visao alpha");

		const assetsByTicker = await repository.findManyForUser(userB.id, {
			ticker: ticker.slice(0, 5),
			limit: 10,
		});

		assert.deepEqual(
			assetsByTicker.map((asset) => asset.id),
			[activeAsset.id],
		);
		assert.equal(assetsByTicker[0]?.userAssetOverrides.length, 1);
		assert.equal(assetsByTicker[0]?.userAssetOverrides[0]?.userId, userB.id);
		assert.equal(assetsByTicker[0]?.userAssetOverrides[0]?.customRiskCategory, RiskCategory.BRICK);

		const assetForUnknownUser = await repository.findByIdForUser(randomUUID(), activeAsset.id);
		assert.equal(assetForUnknownUser?.id, activeAsset.id);
		assert.deepEqual(assetForUnknownUser?.userAssetOverrides, []);
	} finally {
		await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
		await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
		await prisma.$disconnect();
	}
});

test("reuses canonical assets and returns null for missing override targets", async () => {
	const repository = new AssetRepository();
	const user = await createTestUser("asset-repository-canonical");
	const ticker = uniqueTicker("AC");
	const createdAssetIds: string[] = [];

	try {
		const firstAsset = await repository.findOrCreateCanonical({
			ticker,
			name: "Ignored user display name",
			assetType: AssetType.STOCK,
			riskCategory: RiskCategory.OTHER,
			currency: "USD",
			exchange: "NYSE",
		});
		createdAssetIds.push(firstAsset.id);

		const secondAsset = await repository.findOrCreateCanonical({
			ticker,
			name: "Different display name",
			assetType: AssetType.ETF,
			riskCategory: RiskCategory.BRICK,
			currency: "USD",
			exchange: "NYSE",
		});

		assert.equal(secondAsset.id, firstAsset.id);
		assert.equal(firstAsset.name, ticker);
		assert.equal(firstAsset.assetType, AssetType.OTHER);
		assert.equal(firstAsset.riskCategory, RiskCategory.OTHER);
		assert.equal(firstAsset.currency, "USD");
		assert.equal(firstAsset.exchange, "NYSE");

		const missingAssetResult = await repository.upsertOverride(user.id, randomUUID(), {
			customName: "Missing asset",
		});
		assert.equal(missingAssetResult, null);

		const overrideResult = await repository.upsertOverride(user.id, firstAsset.id, {
			customName: "Canonical override",
			customRiskCategory: RiskCategory.HYBRID,
		});

		assert.equal(overrideResult?.id, firstAsset.id);
		assert.equal(overrideResult?.userAssetOverrides.length, 1);
		assert.equal(overrideResult?.userAssetOverrides[0]?.customName, "Canonical override");
		assert.equal(overrideResult?.userAssetOverrides[0]?.customRiskCategory, RiskCategory.HYBRID);
	} finally {
		await prisma.user.deleteMany({ where: { id: user.id } });
		await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
		await prisma.$disconnect();
	}
});
