// How HR reads a day of attendance: present or not, how late, how early they left. Pure functions, no Node APIs.
import { toMinutes, type Shift } from "./perfect-day.ts";
import type { DayInfo } from "./progress.ts";

export type PunchSource = "office" | "remote" | "seed" | "admin_correction";

export type TodayStatus =
  | "no_shift" // weekend: nobody is expected
  | "on_leave"
  | "not_yet" // before the shift starts
  | "not_in" // shift has started, no clock-in
  | "working"
  | "left";

export type TodayRow = {
  status: TodayStatus;
  clockIn: string | null;
  clockOut: string | null;
  lateMinutes: number; // 0 when on time
  earlyMinutes: number; // minutes before shift end they left, 0 if they stayed
  minutesSinceStart: number; // for "not in": how long past the start time it is
  remote: boolean;
  corrected: boolean;
};

export const lateBy = (shift: Shift, clockIn: string) => Math.max(0, toMinutes(clockIn) - toMinutes(shift.start));
export const leftEarlyBy = (shift: Shift, clockOut: string) => Math.max(0, toMinutes(shift.end) - toMinutes(clockOut));

export function todayStatus(args: {
  shift: Shift;
  now: string;
  scheduled?: boolean; // false on weekends
  onLeave: boolean;
  clockIn: { time: string; source: PunchSource } | null;
  clockOut: { time: string; source: PunchSource } | null;
}): TodayRow {
  const { shift, now, onLeave, clockIn, clockOut } = args;
  const base = {
    clockIn: clockIn?.time ?? null,
    clockOut: clockOut?.time ?? null,
    lateMinutes: clockIn ? lateBy(shift, clockIn.time) : 0,
    earlyMinutes: clockOut ? leftEarlyBy(shift, clockOut.time) : 0,
    minutesSinceStart: Math.max(0, toMinutes(now) - toMinutes(shift.start)),
    remote: clockIn?.source === "remote",
    corrected: clockIn?.source === "admin_correction" || clockOut?.source === "admin_correction",
  };
  if (clockIn) return { ...base, status: clockOut ? "left" : "working" };
  if (args.scheduled === false) return { ...base, status: "no_shift", minutesSinceStart: 0 };
  if (onLeave) return { ...base, status: "on_leave" };
  return { ...base, status: toMinutes(now) < toMinutes(shift.start) ? "not_yet" : "not_in" };
}

export type MonthSummary = {
  scheduled: number; // working days so far this month (excluding leave, holidays, weekends)
  attended: number;
  lateDays: number;
  lateMinutes: number;
  absent: number; // past working days with no clock-in; today never counts as absent
  leave: number;
  leftEarly: number;
  missingClockOut: number;
  perfectDays: number;
};

// Built from the same month calendar the employee sees on their Progress page, so HR and the employee never disagree.
export function summarizeMonth(days: DayInfo[], shift: Shift, today: string): MonthSummary {
  const summary: MonthSummary = { scheduled: 0, attended: 0, lateDays: 0, lateMinutes: 0, absent: 0, leave: 0, leftEarly: 0, missingClockOut: 0, perfectDays: 0 };
  for (const day of days) {
    if (day.date > today) continue;
    if (day.kind === "leave" || day.kind === "holiday") {
      summary.leave += 1;
      continue;
    }
    if (day.kind === "weekend") {
      // Weekend work still counts as attendance, but isn't a scheduled day.
      if (day.clockIn) summary.attended += 1;
      continue;
    }
    summary.scheduled += 1;
    if (day.kind === "no_record") summary.absent += 1;
    if (!day.clockIn) continue;
    summary.attended += 1;
    if (day.kind === "perfect") summary.perfectDays += 1;
    const late = lateBy(shift, day.clockIn);
    if (late > 0) {
      summary.lateDays += 1;
      summary.lateMinutes += late;
    }
    if (day.clockOut && leftEarlyBy(shift, day.clockOut) > 0) summary.leftEarly += 1;
    if (day.reason === "missing_clock_out") summary.missingClockOut += 1;
  }
  return summary;
}
