import { classifyArrival, evaluatePerfectDay, type Arrival, type Shift } from "./perfect-day.ts";

export type DayKind = "perfect" | "attended" | "in_progress" | "no_record" | "leave" | "holiday" | "upcoming" | "weekend";
export type DayOff = "leave" | "holiday";
export type Punches = { in: string | null; out: string | null };

export type DayInfo = {
  date: string;
  kind: DayKind;
  clockIn: string | null;
  clockOut: string | null;
  arrival: Arrival | null;
  reason: string | null;
};

export const MILESTONE_TARGETS = [5, 8, 12, 16, 20];

export const milestoneCredits = (target: number) => target;
export const milestoneTitle = (target: number) => `${target} Perfect Days milestone`;

export function milestonesReached(perfectDays: number) {
  return MILESTONE_TARGETS.filter((target) => target <= perfectDays);
}

export function nextMilestone(perfectDays: number) {
  const target = MILESTONE_TARGETS.find((candidate) => candidate > perfectDays);
  return target === undefined ? null : { target, remaining: target - perfectDays, credits: milestoneCredits(target) };
}

// Monday = 0 ... Sunday = 6
export function weekdayIndex(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function buildMonth(args: {
  month: string;
  today: string;
  shift: Shift;
  punches: Record<string, Punches>;
  daysOff: Record<string, DayOff>;
}): DayInfo[] {
  const { month, today, shift, punches, daysOff } = args;
  const [year, monthNumber] = month.split("-").map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days: DayInfo[] = [];

  for (let day = 1; day <= total; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const punch = punches[date] ?? { in: null, out: null };
    const base = {
      date,
      clockIn: punch.in,
      clockOut: punch.out,
      arrival: punch.in ? classifyArrival(shift, punch.in) : null,
      reason: null as string | null,
    };

    if (weekdayIndex(date) >= 5) days.push({ ...base, kind: "weekend" });
    else if (daysOff[date]) days.push({ ...base, kind: daysOff[date] });
    else if (date > today) days.push({ ...base, kind: "upcoming" });
    else if (punch.in && punch.out) {
      const result = evaluatePerfectDay(shift, punch.in, punch.out);
      days.push({ ...base, kind: result.qualifies ? "perfect" : "attended", reason: result.reason });
    } else if (punch.in) {
      const isToday = date === today;
      days.push({ ...base, kind: isToday ? "in_progress" : "attended", reason: isToday ? null : "missing_clock_out" });
    } else days.push({ ...base, kind: date === today ? "upcoming" : "no_record" });
  }
  return days;
}

export const perfectDayCount = (days: DayInfo[]) => days.filter((day) => day.kind === "perfect").length;

export function monthStats(days: DayInfo[], today: string) {
  const scheduled = days.filter((day) => day.kind !== "weekend" && day.kind !== "leave" && day.kind !== "holiday");
  const scheduledToDate = scheduled.filter((day) => day.date <= today);
  const attended = scheduledToDate.filter((day) => day.kind === "perfect" || day.kind === "attended" || day.kind === "in_progress");
  return {
    perfectDays: perfectDayCount(days),
    scheduledShifts: scheduled.length,
    scheduledToDate: scheduledToDate.length,
    attended: attended.length,
    arrivedByStart: attended.filter((day) => day.arrival !== null && day.arrival !== "late").length,
  };
}
