import { test } from "node:test";
import assert from "node:assert/strict";
import { isWeekday, nextWorkday, now, previousWorkdays, shiftDate } from "../src/lib/server/clock.ts";
import { formatStamp, formatWeekday } from "../src/lib/history.ts";

test("the fictional history lands on the working days before today, skipping weekends", () => {
  assert.deepEqual(previousWorkdays("2026-11-11", 7), [
    "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10",
  ]);
  assert.deepEqual(previousWorkdays("2026-11-16", 2), ["2026-11-12", "2026-11-13"], "a Monday looks back to Thursday and Friday");
  assert.deepEqual(previousWorkdays("2026-12-01", 2), ["2026-11-27", "2026-11-30"], "crosses the month boundary");
});

test("next working day skips the weekend", () => {
  assert.equal(nextWorkday("2026-11-05"), "2026-11-06");
  assert.equal(nextWorkday("2026-11-06"), "2026-11-09");
  assert.equal(nextWorkday("2026-11-11", 7), "2026-11-20");
});

test("weekdays and date arithmetic", () => {
  assert.equal(isWeekday("2026-11-13"), true);
  assert.equal(isWeekday("2026-11-14"), false);
  assert.equal(isWeekday("2026-11-15"), false);
  assert.equal(shiftDate("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
});

test("WORKDAY_NOW freezes the clock; without it the clock reads Vietnam time", () => {
  process.env.WORKDAY_NOW = "2026-11-11T08:55";
  assert.deepEqual(now(), { date: "2026-11-11", time: "08:55" });
  process.env.WORKDAY_NOW = "tomorrow";
  assert.throws(() => now());
  delete process.env.WORKDAY_NOW;

  const live = now();
  assert.match(live.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(live.time, /^\d{2}:\d{2}$/);
  const vietnam = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
  assert.equal(live.date, vietnam.slice(0, 10), "Vietnam is UTC+7 with no daylight saving");
});

test("the test clock is ignored unless WORKDAY_TEST_CLOCK=1", async () => {
  const { setTestClock } = await import("../src/lib/server/clock.ts");
  delete process.env.WORKDAY_TEST_CLOCK;
  setTestClock("2001-01-01T00:00");
  assert.notEqual(now().date, "2001-01-01");
  process.env.WORKDAY_TEST_CLOCK = "1";
  assert.deepEqual(now(), { date: "2001-01-01", time: "00:00" });
  setTestClock(null);
  delete process.env.WORKDAY_TEST_CLOCK;
});

test("stored stamps are shown relative to today", () => {
  assert.equal(formatStamp("2026-11-11 09:40", "2026-11-11"), "Today · 09:40");
  assert.equal(formatStamp("2026-11-10 12:30", "2026-11-11"), "Yesterday · 12:30");
  assert.equal(formatStamp("2026-11-02 10:15", "2026-11-11"), "2 Nov · 10:15");
  assert.equal(formatWeekday("2026-11-17"), "Tuesday, 17 November");
});
