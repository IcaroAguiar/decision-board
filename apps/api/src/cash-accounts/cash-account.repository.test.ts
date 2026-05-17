import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../auth/prisma.client.js";
import { CashAccountRepository } from "./cash-account.repository.js";

const TEST_EMAIL_PREFIX = "test-cash-account-repository-";
const CASH_ACCOUNT_TYPE = "CDB";
const CREATED_STATUS = "created";
const NOT_FOUND_STATUS = "not-found";
const EARLIER_CREATED_AT = new Date("2099-01-01T00:00:00.000Z");
const LATER_CREATED_AT = new Date("2099-01-01T00:00:01.000Z");

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

test("scopes cash account repository creation, listing, and updates by user", async () => {
	const repository = new CashAccountRepository();
	const userA = await createUser("a");
	const userB = await createUser("b");
	const portfolioA = await createPortfolio(userA.id, "Cash account repository A");
	const portfolioB = await createPortfolio(userB.id, "Cash account repository B");

	try {
		const missingPortfolio = await repository.createByUser(userA.id, portfolioB.id, {
			name: "Foreign portfolio cash",
			type: CASH_ACCOUNT_TYPE,
			balance: "100",
		});
		assert.equal(missingPortfolio.status, NOT_FOUND_STATUS);

		const laterCashAccount = await repository.createByUser(userA.id, portfolioA.id, {
			name: "Reserva operacional",
			type: CASH_ACCOUNT_TYPE,
			balance: "1000.50",
			liquidity: "D+0",
			benchmark: "CDI",
			benchmarkPercent: "100",
			notes: "caixa operacional",
		});
		assert.equal(laterCashAccount.status, CREATED_STATUS);

		const earlierCashAccount = await repository.createByUser(userA.id, portfolioA.id, {
			name: "Caixa de oportunidades",
			type: CASH_ACCOUNT_TYPE,
			balance: "500",
			liquidity: null,
			benchmark: null,
			benchmarkPercent: null,
			notes: null,
		});
		assert.equal(earlierCashAccount.status, CREATED_STATUS);

		await prisma.cashAccount.update({
			where: {
				id: laterCashAccount.cashAccount.id,
			},
			data: {
				createdAt: LATER_CREATED_AT,
			},
		});
		await prisma.cashAccount.update({
			where: {
				id: earlierCashAccount.cashAccount.id,
			},
			data: {
				createdAt: EARLIER_CREATED_AT,
			},
		});

		const ownCashAccounts = await repository.findManyByPortfolio(userA.id, portfolioA.id);
		assert.deepEqual(
			ownCashAccounts?.map((account) => account.id),
			[earlierCashAccount.cashAccount.id, laterCashAccount.cashAccount.id],
		);
		assert.equal(ownCashAccounts?.[0]?.liquidity, null);
		assert.equal(ownCashAccounts?.[1]?.balance.toString(), "1000.5");
		assert.equal(ownCashAccounts?.[1]?.benchmarkPercent?.toString(), "100");
		assert.equal(await repository.findManyByPortfolio(userB.id, portfolioA.id), null);

		assert.equal(
			(await repository.findByUser(userA.id, laterCashAccount.cashAccount.id))?.id,
			laterCashAccount.cashAccount.id,
		);
		assert.equal(await repository.findByUser(userB.id, laterCashAccount.cashAccount.id), null);

		const updateOtherUser = await repository.updateByUser(
			userB.id,
			laterCashAccount.cashAccount.id,
			{
				balance: "1",
			},
		);
		assert.equal(updateOtherUser, null);

		const updatedCashAccount = await repository.updateByUser(
			userA.id,
			laterCashAccount.cashAccount.id,
			{
				name: "Reserva revisada",
				balance: "1250.75",
				liquidity: "D+1",
				benchmark: "SELIC",
				benchmarkPercent: "105.5",
				notes: null,
			},
		);
		assert.equal(updatedCashAccount?.name, "Reserva revisada");
		assert.equal(updatedCashAccount?.balance.toString(), "1250.75");
		assert.equal(updatedCashAccount?.liquidity, "D+1");
		assert.equal(updatedCashAccount?.benchmark, "SELIC");
		assert.equal(updatedCashAccount?.benchmarkPercent?.toString(), "105.5");
		assert.equal(updatedCashAccount?.notes, null);
	} finally {
		await prisma.user.deleteMany({
			where: {
				email: {
					in: [userA.email, userB.email],
				},
			},
		});
		await prisma.$disconnect();
	}
});
