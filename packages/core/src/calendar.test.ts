import assert from "node:assert/strict";
import test from "node:test";
import { calendarDaysBetween, createBusinessCalendar, parseIsoDate } from "./index.js";

const calendar = createBusinessCalendar(["2026-03-04"]);

test("validates strict calendar dates and leap years", () => {
	assert.equal(parseIsoDate("2028-02-29"), "2028-02-29");
	assert.equal(parseIsoDate("0099-01-01"), "0099-01-01");
	for (const date of [
		"2026-02-30",
		"2026-02-29",
		"2026-2-03",
		"2026-13-01",
		" 2026-01-01",
		"2026-01-01T00:00:00Z",
	]) {
		assert.throws(() => parseIsoDate(date), /Data inválida/);
	}
});

test("counts calendar days in UTC across month, leap year and DST boundaries", () => {
	assert.equal(calendarDaysBetween("2028-02-28", "2028-03-01"), 2);
	assert.equal(calendarDaysBetween("2026-03-07", "2026-03-09"), 2);
	assert.equal(calendarDaysBetween("2026-01-01", "2026-01-01"), 0);
	assert.throws(() => calendarDaysBetween("2026-03-09", "2026-03-02"), /anterior/);
	assert.throws(() => calendarDaysBetween("2026-02-30", "2026-03-02"), /Data inválida/);
});

test("counts DU in a half-open week with a synthetic Wednesday holiday", () => {
	assert.equal(calendar.businessDaysBetween("2026-03-02", "2026-03-09"), 4);
	assert.equal(calendar.businessDaysBetween("2026-03-02", "2026-03-02"), 0);
	assert.equal(calendar.businessDaysBetween("2026-03-07", "2026-03-07"), 0);
	assert.equal(calendar.businessDaysBetween("2026-03-07", "2026-03-10"), 1);
	assert.equal(calendar.businessDaysBetween("2026-03-02", "2026-03-03"), 1);
	assert.throws(() => calendar.businessDaysBetween("2026-03-09", "2026-03-02"), /anterior/);
});

test("identifies weekends and injected holidays only", () => {
	assert.equal(calendar.isBusinessDay("2026-03-04"), false);
	assert.equal(calendar.isBusinessDay("2026-03-07"), false);
	assert.equal(calendar.isBusinessDay("2026-03-08"), false);
	assert.equal(calendar.isBusinessDay("2026-03-05"), true);
	assert.equal(createBusinessCalendar([]).isBusinessDay("2026-03-04"), true);
	assert.throws(() => createBusinessCalendar(["2026-02-30"]), /Data inválida/);
	assert.throws(() => calendar.isBusinessDay("2026-02-30"), /Data inválida/);
});

test("adds business days after the starting date, skipping weekends and holidays", () => {
	assert.equal(calendar.addBusinessDays("2026-02-27", 3), "2026-03-05");
	assert.equal(calendar.addBusinessDays("2026-03-07", 1), "2026-03-09");
	assert.equal(calendar.addBusinessDays("2026-03-04", 1), "2026-03-05");
	assert.equal(calendar.addBusinessDays("2026-03-02", 0), "2026-03-02");
	assert.throws(() => calendar.addBusinessDays("2026-03-07", 0), /inicial deve ser útil/);
	assert.throws(() => calendar.addBusinessDays("2026-03-04", 0), /inicial deve ser útil/);
	for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => calendar.addBusinessDays("2026-03-02", n), /inteiro/);
	}
});
