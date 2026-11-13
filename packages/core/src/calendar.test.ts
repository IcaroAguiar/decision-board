import assert from "node:assert/strict";
import test from "node:test";
import { calendarDaysBetween, createBusinessCalendar, parseIsoDate } from "./index.js";

const calendar = createBusinessCalendar({
	holidays: ["2026-03-04"],
	coveredFrom: "2026-01-01",
	coveredUntil: "2026-12-31",
});

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
	assert.equal(
		createBusinessCalendar({
			holidays: [],
			coveredFrom: "2026-01-01",
			coveredUntil: "2026-12-31",
		}).isBusinessDay("2026-03-04"),
		true,
	);
	assert.throws(
		() =>
			createBusinessCalendar({
				holidays: ["2026-02-30"],
				coveredFrom: "2026-01-01",
				coveredUntil: "2026-12-31",
			}),
		/Data inválida/,
	);
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

test("rejects every query outside inclusive holiday coverage", () => {
	const bounded = createBusinessCalendar({
		holidays: [],
		coveredFrom: "2026-03-02",
		coveredUntil: "2026-03-06",
	});
	assert.equal(bounded.isBusinessDay("2026-03-02"), true);
	assert.equal(bounded.isBusinessDay("2026-03-06"), true);
	for (const date of ["2026-03-01", "2026-03-07"]) {
		assert.throws(() => bounded.isBusinessDay(date), /calendário de feriados não cobre/);
		assert.throws(() => bounded.addBusinessDays(date, 1), /calendário de feriados não cobre/);
		assert.throws(
			() => bounded.businessDaysBetween(date, date),
			/calendário de feriados não cobre/,
		);
	}
	assert.throws(() => bounded.businessDaysBetween("2026-03-02", "2026-03-07"), /não cobre/);
	assert.throws(() => bounded.addBusinessDays("2026-03-06", 1), /não cobre/);
	assert.throws(() => bounded.adjustToBusinessDay("2026-03-07", "preceding"), /não cobre/);
	assert.throws(
		() =>
			createBusinessCalendar({
				holidays: [],
				coveredFrom: "2026-03-06",
				coveredUntil: "2026-03-02",
			}),
		/anterior/,
	);
});

test("adjusts in both directions across weekend and synthetic holidays", () => {
	const calendar = createBusinessCalendar({
		holidays: ["2026-03-06", "2026-03-09"],
		coveredFrom: "2026-03-01",
		coveredUntil: "2026-03-31",
	});
	assert.equal(calendar.adjustToBusinessDay("2026-03-07", "following"), "2026-03-10");
	assert.equal(calendar.adjustToBusinessDay("2026-03-08", "preceding"), "2026-03-05");
	assert.equal(calendar.adjustToBusinessDay("2026-03-10", "following"), "2026-03-10");
	assert.equal(calendar.adjustToBusinessDay("2026-03-05", "preceding"), "2026-03-05");
	const bounded = createBusinessCalendar({
		holidays: [],
		coveredFrom: "2026-03-07",
		coveredUntil: "2026-03-08",
	});
	assert.throws(() => bounded.adjustToBusinessDay("2026-03-07", "following"), /não cobre/);
	assert.throws(() => bounded.adjustToBusinessDay("2026-03-08", "preceding"), /não cobre/);
});

test("exposes its coverage and sorted holidays for reproducibility", () => {
	const covered = createBusinessCalendar({
		holidays: ["2026-03-04", "2026-01-01", "2026-03-04"],
		coveredFrom: "2026-01-01",
		coveredUntil: "2026-12-31",
	});
	assert.deepEqual(covered.coverage, { from: "2026-01-01", until: "2026-12-31" });
	assert.deepEqual(covered.holidays, ["2026-01-01", "2026-03-04"]);
});

test("freezes exposed coverage and keeps only covered holidays", () => {
	const covered = createBusinessCalendar({
		holidays: ["2025-12-25", "2026-03-04"],
		coveredFrom: "2026-01-01",
		coveredUntil: "2026-12-31",
	});
	assert.deepEqual(covered.holidays, ["2026-03-04"]);
	assert.equal(Object.isFrozen(covered.coverage), true);
	assert.equal(Object.isFrozen(covered.holidays), true);
});
