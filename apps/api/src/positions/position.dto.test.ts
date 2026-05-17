import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
	parseCreatePositionDto,
	parsePositionId,
	parsePositionPortfolioId,
	parseUpdatePositionDto,
} from "./position.dto.js";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const OTHER_VALID_UUID = "00000000-0000-4000-8000-000000000002";
const MAX_NOTES = "N".repeat(500);
const INVALID_POSITIVE_DECIMALS = ["0", "-1", "1000000000000", "1.123456789", "abc"];
const INVALID_NON_NEGATIVE_DECIMALS = ["-1", "1000000000000", "1.123456789", "abc"];

test("parses valid position identifiers and create payloads", () => {
	assert.equal(parsePositionId(VALID_UUID), VALID_UUID);
	assert.equal(parsePositionPortfolioId(OTHER_VALID_UUID), OTHER_VALID_UUID);

	assert.deepEqual(
		parseCreatePositionDto({
			assetId: `  ${VALID_UUID}  `,
			quantity: "10.50000000",
			averagePrice: "90",
			manualCurrentPrice: "100.25000000",
			notes: "  entrada manual  ",
		}),
		{
			assetId: VALID_UUID,
			quantity: "10.50000000",
			averagePrice: "90",
			manualCurrentPrice: "100.25000000",
			notes: "entrada manual",
		},
	);

	assert.deepEqual(
		parseCreatePositionDto({
			assetId: VALID_UUID,
			quantity: "1",
			averagePrice: null,
			manualCurrentPrice: null,
			notes: MAX_NOTES,
		}),
		{
			assetId: VALID_UUID,
			quantity: "1",
			averagePrice: null,
			manualCurrentPrice: null,
			notes: MAX_NOTES,
		},
	);
});

test("parses partial position updates and nullable fields", () => {
	assert.deepEqual(
		parseUpdatePositionDto({
			quantity: "2.00000001",
			averagePrice: undefined,
			manualCurrentPrice: null,
			notes: "  ajuste manual  ",
		}),
		{
			quantity: "2.00000001",
			manualCurrentPrice: null,
			notes: "ajuste manual",
		},
	);

	assert.deepEqual(
		parseUpdatePositionDto({
			averagePrice: "0",
		}),
		{
			averagePrice: "0",
		},
	);
});

test("rejects invalid position request shapes and unknown fields", () => {
	assertBadRequest(() => parseCreatePositionDto(null));
	assertBadRequest(() => parseCreatePositionDto([]));
	assertBadRequest(() => parseCreatePositionDto({}));
	assertBadRequest(() =>
		parseCreatePositionDto({
			assetId: VALID_UUID,
			quantity: "1",
			userId: VALID_UUID,
		}),
	);
	assertBadRequest(() => parseUpdatePositionDto({}));
	assertBadRequest(() => parseUpdatePositionDto({ ownerId: VALID_UUID }));
});

test("rejects invalid position identifiers and string fields", () => {
	assertBadRequest(() => parsePositionId("not-a-uuid"));
	assertBadRequest(() => parsePositionPortfolioId("00000000-0000-0000-0000-000000000000"));
	assertBadRequest(() =>
		parseCreatePositionDto({
			assetId: 123,
			quantity: "1",
		}),
	);
	assertBadRequest(() =>
		parseCreatePositionDto({
			assetId: " ",
			quantity: "1",
		}),
	);
	assertBadRequest(() =>
		parseCreatePositionDto({
			assetId: VALID_UUID,
			quantity: 1,
		}),
	);
	assertBadRequest(() =>
		parseUpdatePositionDto({
			notes: " ",
		}),
	);
	assertBadRequest(() =>
		parseUpdatePositionDto({
			notes: "N".repeat(501),
		}),
	);
});

test("rejects invalid position decimals", () => {
	for (const quantity of INVALID_POSITIVE_DECIMALS) {
		assertBadRequest(() =>
			parseCreatePositionDto({
				assetId: VALID_UUID,
				quantity,
			}),
		);
	}

	for (const manualCurrentPrice of INVALID_NON_NEGATIVE_DECIMALS) {
		assertBadRequest(() =>
			parseUpdatePositionDto({
				manualCurrentPrice,
			}),
		);
	}
});

function assertBadRequest(action: () => unknown): void {
	assert.throws(action, BadRequestException);
}
