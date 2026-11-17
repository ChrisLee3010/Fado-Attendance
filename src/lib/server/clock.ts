// The server is the only source of attendance time. Browsers never send it.
const TIME_ZONE = "Asia/Ho_Chi_Minh";

export type Now = { date: string; time: string };

const PINNED = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/;

const globalForClock = globalThis as unknown as { __workdayTestClock?: string };

export const testClockEnabled = () => process.env.WORKDAY_TEST_CLOCK === "1";

// Used only by the test-clock route, which refuses to run unless WORKDAY_TEST_CLOCK=1.
export function setTestClock(value: string | null) {
  if (value !== null && !PINNED.test(value)) throw new Error(`invalid clock value: ${value}`);
  globalForClock.__workdayTestClock = value ?? undefined;
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function now(): Now {
  // WORKDAY_NOW freezes the clock for demos; the test clock overrides it while tests run.
  const pinned = (testClockEnabled() ? globalForClock.__workdayTestClock : undefined) ?? process.env.WORKDAY_NOW;
  if (pinned) {
    const match = PINNED.exec(pinned);
    if (!match) throw new Error(`WORKDAY_NOW must look like 2026-11-11T08:55, got ${pinned}`);
    return { date: match[1], time: match[2] };
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export const today = () => now().date;

// "YYYY-MM-DD HH:MM", for columns that record when something happened.
export function stamp() {
  const { date, time } = now();
  return `${date} ${time}`;
}

export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export const isWeekday = (date: string) => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
};

// The `count` working days before `date`, oldest first.
export function previousWorkdays(date: string, count: number) {
  const days: string[] = [];
  for (let cursor = shiftDate(date, -1); days.length < count; cursor = shiftDate(cursor, -1)) {
    if (isWeekday(cursor)) days.unshift(cursor);
  }
  return days;
}

export function nextWorkday(date: string, after = 1) {
  let cursor = date;
  for (let found = 0; found < after; ) {
    cursor = shiftDate(cursor, 1);
    if (isWeekday(cursor)) found += 1;
  }
  return cursor;
}
