import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonth,
  MILESTONE_TARGETS,
  milestoneCredits,
  milestonesReached,
  milestoneTitle,
  monthStats,
  nextMilestone,
  perfectDayCount,
  weekdayIndex,
} from "../src/lib/progress.ts";

const SHIFT = { start: "09:00", end: "18:00" };
const MONTH = "2026-11";
const TODAY = "2026-11-11";

const build = (punches = {}, daysOff = {}, today = TODAY) => buildMonth({ month: MONTH, today, shift: SHIFT, punches, daysOff });
const day = (days, date) => days.find((entry) => entry.date === date);

test("weeks start on Monday", () => {
  assert.equal(weekdayIndex("2026-11-01"), 6, "Sunday");
  assert.equal(weekdayIndex("2026-11-02"), 0, "Monday");
  assert.equal(weekdayIndex("2026-11-11"), 2, "Wednesday");
  assert.equal(weekdayIndex("2026-11-14"), 5, "Saturday");
});

test("a month has one entry per calendar day, with weekends marked", () => {
  const days = build();
  assert.equal(days.length, 30);
  assert.deepEqual(days.filter((entry) => entry.kind === "weekend").map((entry) => entry.date).slice(0, 4), ["2026-11-01", "2026-11-07", "2026-11-08", "2026-11-14"]);
});

test("a Perfect Day needs both punches inside the shift windows", () => {
  const days = build({ "2026-11-02": { in: "08:52", out: "18:03" } });
  assert.equal(day(days, "2026-11-02").kind, "perfect");
});

test("a day that misses the Perfect Day still counts as attended, with the reason", () => {
  const days = build({
    "2026-11-03": { in: "09:04", out: "18:05" },
    "2026-11-04": { in: "08:55", out: "17:58" },
    "2026-11-05": { in: "08:30", out: "18:05" },
    "2026-11-06": { in: "08:55", out: "18:30" },
  });
  assert.deepEqual(
    ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((date) => [day(days, date).kind, day(days, date).reason]),
    [["attended", "late_arrival"], ["attended", "early_departure"], ["attended", "arrived_outside_window"], ["attended", "left_outside_window"]],
  );
});

test("window edges are inclusive: 08:50 and 09:00 in, 18:00 and 18:10 out", () => {
  const days = build({
    "2026-11-02": { in: "08:50", out: "18:00" },
    "2026-11-03": { in: "09:00", out: "18:10" },
    "2026-11-04": { in: "08:49", out: "18:00" },
    "2026-11-05": { in: "09:01", out: "18:00" },
  });
  assert.deepEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((date) => day(days, date).kind), ["perfect", "perfect", "attended", "attended"]);
});

test("today: clocked in is in progress, nothing yet is simply upcoming, never a failure", () => {
  assert.equal(day(build({ [TODAY]: { in: "08:55", out: null } }), TODAY).kind, "in_progress");
  assert.equal(day(build(), TODAY).kind, "upcoming");
});

test("a past day with a clock-in but no clock-out is attended and flags the missing punch", () => {
  const entry = day(build({ "2026-11-09": { in: "08:55", out: null } }), "2026-11-09");
  assert.deepEqual([entry.kind, entry.reason], ["attended", "missing_clock_out"]);
});

test("a past workday with no punches is 'no record', and future workdays are upcoming", () => {
  const days = build();
  assert.equal(day(days, "2026-11-03").kind, "no_record");
  assert.equal(day(days, "2026-11-12").kind, "upcoming");
});

test("approved leave and holidays are neutral, even when nothing was punched", () => {
  const days = build({}, { "2026-11-06": "leave", "2026-11-09": "holiday" });
  assert.equal(day(days, "2026-11-06").kind, "leave");
  assert.equal(day(days, "2026-11-09").kind, "holiday");
});

test("punches on a weekend do not create a scheduled day", () => {
  assert.equal(day(build({ "2026-11-07": { in: "09:00", out: "18:00" } }), "2026-11-07").kind, "weekend");
});

test("month stats: scheduled shifts exclude weekends and leave; attendance is counted to date", () => {
  const days = build(
    {
      "2026-11-02": { in: "08:52", out: "18:03" },
      "2026-11-04": { in: "08:59", out: "18:00" },
      "2026-11-05": { in: "09:04", out: "18:05" },
      "2026-11-09": { in: "08:57", out: "18:06" },
      "2026-11-10": { in: "08:58", out: "18:03" },
      [TODAY]: { in: "09:03", out: null },
    },
    { "2026-11-06": "leave" },
  );
  assert.deepEqual(monthStats(days, TODAY), {
    perfectDays: 4,
    scheduledShifts: 20,
    scheduledToDate: 7,
    attended: 6,
    arrivedByStart: 4,
  });
});

test("perfect days are counted from the calendar", () => {
  const days = build({ "2026-11-02": { in: "08:52", out: "18:03" }, "2026-11-03": { in: "08:55", out: "18:00" }, "2026-11-04": { in: "09:30", out: "18:00" } });
  assert.equal(perfectDayCount(days), 2);
});

test("milestones: thresholds, credits and titles", () => {
  assert.deepEqual(MILESTONE_TARGETS, [5, 8, 12, 16, 20]);
  assert.deepEqual(milestonesReached(0), []);
  assert.deepEqual(milestonesReached(7), [5]);
  assert.deepEqual(milestonesReached(8), [5, 8]);
  assert.deepEqual(milestonesReached(40), [5, 8, 12, 16, 20]);
  assert.equal(milestoneCredits(8), 8);
  assert.equal(milestoneTitle(12), "Mốc 12 Perfect Day");
});

test("the next milestone says how many Perfect Days remain, and ends after the last one", () => {
  assert.deepEqual(nextMilestone(0), { target: 5, remaining: 5, credits: 5 });
  assert.deepEqual(nextMilestone(7), { target: 8, remaining: 1, credits: 8 });
  assert.deepEqual(nextMilestone(8), { target: 12, remaining: 4, credits: 12 });
  assert.equal(nextMilestone(20), null);
});
