// The monthly honour wall: levels, never rankings. Pure functions, no Node APIs.
//
// The brief asks to honour the most diligent people every month, without comparing anyone ("không so sánh hơn thua").
// So people earn a level on their own record; everyone who earns it is listed together, alphabetically, with no numbers.
import { lateBy } from "./attendance-status.ts";
import type { Shift } from "./perfect-day.ts";
import type { DayInfo } from "./progress.ts";

export type HonourTier = "perfect_month" | "on_time" | "full_attendance";

// Highest first.
export const HONOUR_TIERS: HonourTier[] = ["perfect_month", "on_time", "full_attendance"];

export const HONOUR_TITLES: Record<HonourTier, { title: string; description: string; icon: string }> = {
  perfect_month: { title: "Tháng hoàn hảo", description: "Mọi ngày làm việc đều là Perfect Day.", icon: "🌟" },
  on_time: { title: "Đúng giờ mỗi ngày", description: "Không vắng ngày nào, không trễ ngày nào.", icon: "⏰" },
  full_attendance: { title: "Không vắng ngày nào", description: "Có mặt mọi ngày làm việc. Nghỉ phép được duyệt không bị tính.", icon: "✅" },
};

const isScheduled = (day: DayInfo) => day.kind !== "weekend" && day.kind !== "leave" && day.kind !== "holiday";

// The level earned over the working days before `until` (exclusive). null if none: an absence, or no working days.
export function honourTier(days: DayInfo[], shift: Shift, until: string): HonourTier | null {
  const counted = days.filter((day) => day.date < until && isScheduled(day));
  if (counted.length === 0 || counted.some((day) => !day.clockIn)) return null;
  if (counted.every((day) => day.kind === "perfect")) return "perfect_month";
  if (counted.every((day) => lateBy(shift, day.clockIn!) === 0)) return "on_time";
  return "full_attendance";
}

// For your own Progress page: the level you'd get if the rest of the month goes perfectly.
// Today counts only once it's a finished Perfect Day, so a morning that hasn't started yet doesn't spoil anything.
export function honourOutlook(days: DayInfo[], shift: Shift, today: string) {
  const todayInfo = days.find((day) => day.date === today);
  const includeToday = todayInfo?.kind === "perfect";
  const until = includeToday ? nextDate(today) : today;
  const daysSoFar = days.filter((day) => day.date < until && isScheduled(day)).length;
  const daysLeft = days.filter((day) => day.date >= until && isScheduled(day)).length;
  return { tier: daysSoFar === 0 ? ("perfect_month" as HonourTier) : honourTier(days, shift, until), daysSoFar, daysLeft };
}

function nextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function firstDayOfNextMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
}
