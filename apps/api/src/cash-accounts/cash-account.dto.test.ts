import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
	parseCashAccountId,
	parseCashAccountPortfolioId,
	parseCreateCashAccountDto,
	parseUpdateCashAccountDto,
} from "./cash-account.dto.js";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const OTHER_VALID_UUID = "00000000-0000-4000-8000-000000000002";
const MAX_NAME = "R".repeat(120);
const MAX_CLASSIFICATION = "C".repeat(80);
const MAX_NOTES = "N".repeat(500);
const INVALID_BALANCES = ["-1", "1000000000000", "1.123456789", "abc"];
const INVALID_BENCHMARK_PERCENTS = ["-1", "1000000", "1.12345", "abc"];

test("parses valid cash account identifiers and create payloads", () => {
	assert.equal(parseCashAccountId(VALID_UUID), VALID_UUID);
	assert.equal(parseCashAccountPortfolioId(OTHER_VALID_UUID), OTHER_VALID_UUID);

	assert.deepEqual(
		parseCreateCashAccountDto({
			name: "  Reserva diaria  ",
			type: "  CDB  ",
			balance: "1000.50000000",
			liquidity: "  D+0  ",
			benchmark: "  CDI  ",
			benchmarkPercent: "100.1234",
			notes: "  caixa operacional  ",
		}),
		{
			name: "Reserva diaria",
			type: "CDB",
			balance: "1000.50000000",
			liquidity: "D+0",
			benchmark: "CDI",
			benchmarkPercent: "100.1234",
			notes: "caixa operacional",
		},
	);

	assert.deepEqual(
		parseCreateCashAccountDto({
			name: MAX_NAME,
			type: MAX_CLASSIFICATION,
			balance: "0",
			liquidity: null,
			benchmark: null,
			benchmarkPercent: null,
			notes: MAX_NOTES,
		}),
		{
			name: MAX_NAME,
			type: MAX_CLASSIFICATION,
			balance: "0",
			liquidity: null,
			benchmark: null,
			benchmarkPercent: null,
			notes: MAX_NOTES,
		},
	);
});

test("parses partial cash account updates and nullable fields", () => {
	assert.deepEqual(
		parseUpdateCashAccountDto({
			name: "  Reserva nova  ",
			type: "Tesouro",
			balance: "10.00000001",
			liquidity: undefined,
			benchmark: null,
			benchmarkPercent: "0",
			notes: null,
		}),
		{
			name: "Reserva nova",
			type: "Tesouro",
			balance: "10.00000001",
			benchmark: null,
			benchmarkPercent: "0",
			notes: null,
		},
	);

	assert.deepEqual(
		parseUpdateCashAccountDto({
			liquidity: "D+1",
		}),
		{
			liquidity: "D+1",
		},
	);
});

test("rejects invalid cash account request shapes and unknown fields", () => {
	assertBadRequest(() => parseCreateCashAccountDto(null));
	assertBadRequest(() => parseCreateCashAccountDto([]));
	assertBadRequest(() => parseCreateCashAccountDto({}));
	assertBadRequest(() =>
		parseCreateCashAccountDto({
			name: "Reserva",
			type: "CDB",
			balance: "100",
			userId: VALID_UUID,
		}),
	);
	assertBadRequest(() => parseUpdateCashAccountDto({}));
	assertBadRequest(() => parseUpdateCashAccountDto({ ownerId: VALID_UUID }));
});

test("rejects invalid cash account identifiers and string fields", () => {
	assertBadRequest(() => parseCashAccountId("not-a-uuid"));
	assertBadRequest(() => parseCashAccountPortfolioId("00000000-0000-0000-0000-000000000000"));
	assertBadRequest(() =>
		parseCreateCashAccountDto({
			name: 123,
			type: "CDB",
			balance: "100",
		}),
	);
	assertBadRequest(() =>
		parseCreateCashAccountDto({
			name: " ",
			type: "CDB",
			balance: "100",
		}),
	);
	assertBadRequest(() =>
		parseCreateCashAccountDto({
			name: "R".repeat(121),
			type: "CDB",
			balance: "100",
		}),
	);
	assertBadRequest(() =>
		parseUpdateCashAccountDto({
			type: "C".repeat(81),
		}),
	);
	assertBadRequest(() =>
		parseUpdateCashAccountDto({
			notes: "N".repeat(501),
		}),
	);
});

test("rejects invalid cash account decimals", () => {
	for (const balance of INVALID_BALANCES) {
		assertBadRequest(() =>
			parseCreateCashAccountDto({
				name: "Reserva",
				type: "CDB",
				balance,
			}),
		);
	}

	for (const benchmarkPercent of INVALID_BENCHMARK_PERCENTS) {
		assertBadRequest(() =>
			parseUpdateCashAccountDto({
				benchmarkPercent,
			}),
		);
	}
});

function assertBadRequest(action: () => unknown): void {
	assert.throws(action, BadRequestException);
}
