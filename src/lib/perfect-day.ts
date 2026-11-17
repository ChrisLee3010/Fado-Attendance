export const PERFECT_DAY_CREDITS = 2;
const WINDOW_MINUTES = 10;

export type Shift = { start: string; end: string };
export type Arrival = "on_time" | "late" | "early";

export function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Clock-in must land in [start - 10, start] inclusive; anything later is late, anything earlier is outside the window.
export function classifyArrival(shift: Shift, clockIn: string): Arrival {
  const start = toMinutes(shift.start);
  const arrived = toMinutes(clockIn);
  if (arrived > start) return "late";
  if (arrived < start - WINDOW_MINUTES) return "early";
  return "on_time";
}

export function perfectDayWindow(shift: Shift) {
  return {
    clockIn: `${toTime(toMinutes(shift.start) - WINDOW_MINUTES)}–${shift.start}`,
    clockOut: `${shift.end}–${toTime(toMinutes(shift.end) + WINDOW_MINUTES)}`,
  };
}

// Clock-out must land in [end, end + 10] inclusive.
export function evaluatePerfectDay(shift: Shift, clockIn: string, clockOut: string) {
  const arrival = classifyArrival(shift, clockIn);
  if (arrival === "late") return { qualifies: false, reason: "late_arrival" as const };
  if (arrival === "early") return { qualifies: false, reason: "arrived_outside_window" as const };

  const end = toMinutes(shift.end);
  const left = toMinutes(clockOut);
  if (left < end) return { qualifies: false, reason: "early_departure" as const };
  if (left > end + WINDOW_MINUTES) return { qualifies: false, reason: "left_outside_window" as const };
  return { qualifies: true, reason: "perfect_day" as const };
}
