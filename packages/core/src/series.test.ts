import assert from "node:assert/strict";
import test from "node:test";
import {
	addMonths,
	alignSeries,
	createMonthlySeries,
	known,
	type MonthlyPoint,
	missing,
	monthsBetween,
	parseYearMonth,
	yearMonthOf,
} from "./index.js";

const source = { id: "synthetic", label: "Sintética", asOf: "2026-01-01", official: true };
function point(month: string, value: number): MonthlyPoint {
	return { month, value: known(value, "observed", source) };
}

test("validates strict months and shifts across year boundaries", () => {
	assert.equal(parseYearMonth("2026-11"), "2026-11");
	for (const value of ["2026-13", "2026-1", "2026-00", "2026-01-01", " 2026-01"]) {
		assert.throws(() => parseYearMonth(value), /Mês inválido/);
	}
	assert.equal(addMonths("2026-11", 3), "2027-02");
	assert.equal(addMonths("2026-01", -1), "2025-12");
	assert.equal(addMonths("0099-12", 1), "0100-01");
	assert.equal(monthsBetween("2025-12", "2027-02"), 14);
	assert.equal(monthsBetween("2026-01", "2026-01"), 0);
	assert.throws(() => monthsBetween("2026-02", "2026-01"), /anterior/);
	assert.throws(() => addMonths("2026-01", 1.5), /inteiro/);
	assert.throws(() => addMonths("0000-01", -1), /intervalo/);
	assert.equal(yearMonthOf("2028-02-29"), "2028-02");
	assert.throws(() => yearMonthOf("2026-02-30"), /Data inválida/);
});

test("validates increasing series without filling gaps", () => {
	const points = [point("2026-01", 1), point("2026-03", 3)];
	assert.deepEqual(createMonthlySeries(points), points);
	assert.throws(() => createMonthlySeries([point("2026-01", 1), point("2026-01", 2)]), /crescente/);
	assert.throws(() => createMonthlySeries([point("2026-03", 1), point("2026-01", 2)]), /crescente/);
	assert.throws(() => createMonthlySeries([point("2026-01", NaN)]), /finito/);
});

test("aligns only common known months and reports missing data and gaps", () => {
	const first = createMonthlySeries([
		point("2026-01", 1),
		{ month: "2026-02", value: missing("Sem retorno") },
		point("2026-03", 3),
		point("2026-04", 0),
	]);
	const second = createMonthlySeries([
		point("2026-01", 10),
		point("2026-02", 20),
		point("2026-04", 40),
	]);
	assert.deepEqual(alignSeries([first, second]), {
		months: ["2026-01", "2026-04"],
		values: [
			[1, 0],
			[10, 40],
		],
		overlap: 2,
		requested: null,
		missingMonths: ["2026-02", "2026-03"],
		coverage: "partial",
	});
});

test("reports 24 available months out of a 30-month inclusive window", () => {
	const points = createMonthlySeries(
		Array.from({ length: 24 }, (_, index) => point(addMonths("2025-01", index), index)),
	);
	const result = alignSeries([points, points], { end: "2026-12", months: 30 });
	assert.equal(result.coverage, "partial");
	assert.equal(result.requested, 30);
	assert.equal(result.overlap, 24);
	assert.deepEqual(result.missingMonths, [
		"2024-07",
		"2024-08",
		"2024-09",
		"2024-10",
		"2024-11",
		"2024-12",
	]);
	assert.equal(result.months[0], "2025-01");
	assert.equal(result.months.at(-1), "2026-12");
	assert.equal(alignSeries([points], { end: "2026-12", months: 24 }).coverage, "complete");
	assert.equal(alignSeries([[], points]).coverage, "empty");
	assert.deepEqual(alignSeries([]), {
		months: [],
		values: [],
		overlap: 0,
		requested: null,
		missingMonths: [],
		coverage: "empty",
	});
	assert.throws(() => alignSeries([points], { end: "2026-12", months: 0 }), /janela/);
});
