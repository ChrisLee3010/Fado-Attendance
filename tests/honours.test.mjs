import { test } from "node:test";
import assert from "node:assert/strict";
import { firstDayOfNextMonth, honourOutlook, honourTier } from "../src/lib/honours.ts";
import { buildMonth } from "../src/lib/progress.ts";

const SHIFT = { start: "09:00", end: "18:00" };
// October 2026 has 22 working days: 1–2, 5–9, 12–16, 19–23, 26–30.
const OCTOBER_WORKDAYS = Array.from({ length: 31 }, (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`)
  .filter((date) => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));

function october(overrides = {}, daysOff = {}) {
  const punches = Object.fromEntries(OCTOBER_WORKDAYS.map((date) => [date, { in: "08:55", out: "18:03" }]));
  for (const [date, punch] of Object.entries(overrides)) {
    if (punch === null) delete punches[date];
    else punches[date] = punch;
  }
  const days = buildMonth({ month: "2026-10", today: "2026-11-19", shift: SHIFT, punches, daysOff });
  return honourTier(days, SHIFT, firstDayOfNextMonth("2026-10"));
}

test("every working day a Perfect Day: Perfect month", () => {
  assert.equal(OCTOBER_WORKDAYS.length, 22);
  assert.equal(october(), "perfect_month");
});

test("never late but one day outside the clock-out window: On time, every day", () => {
  assert.equal(october({ "2026-10-14": { in: "08:57", out: "18:40" } }), "on_time");
  assert.equal(october({ "2026-10-14": { in: "08:57", out: null } }), "on_time", "forgot to clock out once");
});

test("late once but never absent: Never missed a day", () => {
  assert.equal(october({ "2026-10-14": { in: "09:07", out: "18:05" } }), "full_attendance");
});

test("one absence: no level this month", () => {
  assert.equal(october({ "2026-10-14": null }), null);
});

test("approved leave doesn't count against anyone, and weekend days are ignored", () => {
  assert.equal(october({ "2026-10-14": null }, { "2026-10-14": "leave" }), "perfect_month");
  assert.equal(october({ "2026-10-10": { in: "10:00", out: "12:00" } }), "perfect_month", "a Saturday shift");
});

test("a month with no working days earns nothing", () => {
  const days = buildMonth({ month: "2026-10", today: "2026-11-19", shift: SHIFT, punches: {}, daysOff: Object.fromEntries(OCTOBER_WORKDAYS.map((date) => [date, "leave"])) });
  assert.equal(honourTier(days, SHIFT, "2026-11-01"), null);
});

test("outlook: what you're on track for, with today counted only once it's a finished Perfect Day", () => {
  const punches = { "2026-11-02": { in: "08:55", out: "18:02" }, "2026-11-03": { in: "08:57", out: "18:01" } };
  const morning = buildMonth({ month: "2026-11", today: "2026-11-04", shift: SHIFT, punches, daysOff: {} });
  assert.deepEqual(honourOutlook(morning, SHIFT, "2026-11-04"), { tier: "perfect_month", daysSoFar: 2, daysLeft: 19 });

  const evening = buildMonth({ month: "2026-11", today: "2026-11-04", shift: SHIFT, punches: { ...punches, "2026-11-04": { in: "08:58", out: "18:04" } }, daysOff: {} });
  assert.deepEqual(honourOutlook(evening, SHIFT, "2026-11-04"), { tier: "perfect_month", daysSoFar: 3, daysLeft: 18 });

  const lateToday = buildMonth({ month: "2026-11", today: "2026-11-04", shift: SHIFT, punches: { ...punches, "2026-11-04": { in: "09:20", out: null } }, daysOff: {} });
  assert.equal(honourOutlook(lateToday, SHIFT, "2026-11-04").tier, "perfect_month", "today isn't judged until it's over");

  const missed = buildMonth({ month: "2026-11", today: "2026-11-04", shift: SHIFT, punches: { "2026-11-02": punches["2026-11-02"] }, daysOff: {} });
  assert.equal(honourOutlook(missed, SHIFT, "2026-11-04").tier, null, "Tuesday was missed");

  const firstDay = buildMonth({ month: "2026-12", today: "2026-12-01", shift: SHIFT, punches: {}, daysOff: {} });
  assert.deepEqual(honourOutlook(firstDay, SHIFT, "2026-12-01"), { tier: "perfect_month", daysSoFar: 0, daysLeft: 23 }, "a fresh month");
});
