import { test } from "node:test";
import assert from "node:assert/strict";
import { lateBy, leftEarlyBy, summarizeMonth, todayStatus } from "../src/lib/attendance-status.ts";
import { buildMonth } from "../src/lib/progress.ts";

const SHIFT = { start: "09:00", end: "18:00" };
const office = (time) => ({ time, source: "office" });

test("minutes late and minutes left early", () => {
  assert.equal(lateBy(SHIFT, "08:55"), 0);
  assert.equal(lateBy(SHIFT, "09:00"), 0, "on the dot is on time");
  assert.equal(lateBy(SHIFT, "09:01"), 1);
  assert.equal(lateBy(SHIFT, "10:15"), 75);
  assert.equal(leftEarlyBy(SHIFT, "18:00"), 0);
  assert.equal(leftEarlyBy(SHIFT, "17:45"), 15);
  assert.equal(leftEarlyBy(SHIFT, "19:30"), 0);
});

test("today: before the shift, nobody is missing yet", () => {
  const row = todayStatus({ shift: SHIFT, now: "08:40", onLeave: false, clockIn: null, clockOut: null });
  assert.deepEqual([row.status, row.minutesSinceStart], ["not_yet", 0]);
});

test("today: after the start time, no clock-in is 'not in', with how long it's been", () => {
  const row = todayStatus({ shift: SHIFT, now: "09:25", onLeave: false, clockIn: null, clockOut: null });
  assert.deepEqual([row.status, row.minutesSinceStart], ["not_in", 25]);
});

test("today: working, late by some minutes, then left early", () => {
  const working = todayStatus({ shift: SHIFT, now: "11:00", onLeave: false, clockIn: office("09:12"), clockOut: null });
  assert.deepEqual([working.status, working.lateMinutes, working.clockIn], ["working", 12, "09:12"]);
  const left = todayStatus({ shift: SHIFT, now: "17:40", onLeave: false, clockIn: office("09:12"), clockOut: office("17:30") });
  assert.deepEqual([left.status, left.earlyMinutes], ["left", 30]);
});

test("today: on a weekend nobody is missing, but weekend work still shows", () => {
  assert.equal(todayStatus({ shift: SHIFT, now: "11:00", scheduled: false, onLeave: false, clockIn: null, clockOut: null }).status, "no_shift");
  assert.equal(todayStatus({ shift: SHIFT, now: "11:00", scheduled: false, onLeave: false, clockIn: office("10:02"), clockOut: null }).status, "working");
});

test("today: leave, remote work and corrections are flagged", () => {
  assert.equal(todayStatus({ shift: SHIFT, now: "10:00", onLeave: true, clockIn: null, clockOut: null }).status, "on_leave");
  assert.equal(todayStatus({ shift: SHIFT, now: "10:00", onLeave: true, clockIn: office("08:58"), clockOut: null }).status, "working", "came in anyway");
  assert.equal(todayStatus({ shift: SHIFT, now: "10:00", onLeave: false, clockIn: { time: "08:58", source: "remote" }, clockOut: null }).remote, true);
  assert.equal(todayStatus({ shift: SHIFT, now: "19:00", onLeave: false, clockIn: office("08:58"), clockOut: { time: "18:02", source: "admin_correction" } }).corrected, true);
});

test("month summary counts what HR needs, and today is never absent", () => {
  const days = buildMonth({
    month: "2026-11",
    today: "2026-11-11",
    shift: SHIFT,
    punches: {
      "2026-11-02": { in: "08:55", out: "18:03" }, // perfect
      "2026-11-03": { in: "09:20", out: "18:00" }, // late 20
      "2026-11-04": { in: "09:05", out: "17:30" }, // late 5, left early
      // 05: absent
      "2026-11-07": { in: "10:00", out: "12:00" }, // Saturday: attended, not scheduled
      "2026-11-09": { in: "08:58", out: null }, // forgot to clock out
      "2026-11-10": { in: "08:57", out: "18:05" }, // perfect
      // 11 (today): not clocked in yet, not absent
    },
    daysOff: { "2026-11-06": "leave" },
  });
  assert.deepEqual(summarizeMonth(days, SHIFT, "2026-11-11"), {
    scheduled: 7, // 2,3,4,5,9,10,11
    attended: 6, // 2,3,4,7(weekend),9,10
    lateDays: 2,
    lateMinutes: 25,
    absent: 1,
    leave: 1,
    leftEarly: 1,
    missingClockOut: 1,
    perfectDays: 2,
  });
});
