export type Category = "attendance" | "achievement" | "redemption" | "adjustment";
export type TxStatus = "credited" | "issued" | "used";

export type HistoryEntry = {
  id: string;
  amount: number;
  title: string;
  date: string;
  time: string;
  category: Category;
  status: TxStatus;
};

export const CATEGORIES: Category[] = ["attendance", "achievement", "redemption", "adjustment"];
export const STATUSES: TxStatus[] = ["credited", "issued", "used"];

export const CATEGORY_LABELS: Record<Category, string> = {
  attendance: "Attendance",
  achievement: "Achievement",
  redemption: "Reward redemption",
  adjustment: "Adjustment",
};

export const STATUS_LABELS: Record<TxStatus, string> = {
  credited: "Credited",
  issued: "Voucher ready",
  used: "Voucher used",
};

export type Period = "month" | "last_month" | "ninety_days" | "all";
export type QuickFilter = "all" | "earned" | "spent" | "adjustments";

export const PERIOD_LABELS: Record<Period, string> = {
  month: "This month",
  last_month: "Last month",
  ninety_days: "Last 90 days",
  all: "All time",
};

export type Filters = {
  quick: QuickFilter;
  period: Period;
  categories: Category[];
  statuses: TxStatus[];
  from: string;
  to: string;
};

export const DEFAULT_FILTERS: Filters = { quick: "all", period: "month", categories: [], statuses: [], from: "", to: "" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const monthKey = (date: string) => date.slice(0, 7);

function previousMonthKey(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

export function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatShort(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1].slice(0, 3)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "Wednesday, 11 November"
export function formatWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}, ${day} ${MONTHS[month - 1]}`;
}

export function formatWhen(entry: Pick<HistoryEntry, "date" | "time">, today: string) {
  const day = entry.date === today ? "Today" : entry.date === shiftDate(today, -1) ? "Yesterday" : formatShort(entry.date);
  return `${day} · ${entry.time}`;
}

// Same as formatWhen, for "YYYY-MM-DD HH:MM" stamps stored in the database.
export function formatStamp(stamp: string, today: string) {
  const [date, time] = stamp.split(" ");
  return formatWhen({ date, time }, today);
}

function inPeriod(date: string, period: Period, today: string) {
  if (period === "month") return monthKey(date) === monthKey(today);
  if (period === "last_month") return monthKey(date) === previousMonthKey(today);
  if (period === "ninety_days") return date >= shiftDate(today, -89) && date <= today;
  return true;
}

export const hasCustomRange = (filters: Filters) => filters.from !== "" || filters.to !== "";

export function applyFilters(entries: HistoryEntry[], filters: Filters, today: string) {
  return entries.filter((entry) => {
    if (filters.quick === "earned" && entry.amount <= 0) return false;
    if (filters.quick === "spent" && entry.amount >= 0) return false;
    if (filters.quick === "adjustments" && entry.category !== "adjustment") return false;
    if (filters.categories.length > 0 && !filters.categories.includes(entry.category)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(entry.status)) return false;
    if (hasCustomRange(filters)) {
      if (filters.from && entry.date < filters.from) return false;
      if (filters.to && entry.date > filters.to) return false;
      return true;
    }
    return inPeriod(entry.date, filters.period, today);
  });
}

export function groupByDay(entries: HistoryEntry[]) {
  const groups: { date: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }
  return groups;
}

export function monthTotals(entries: HistoryEntry[], today: string) {
  let earned = 0;
  let spent = 0;
  for (const entry of entries) {
    if (monthKey(entry.date) !== monthKey(today)) continue;
    if (entry.amount > 0) earned += entry.amount;
    else spent += -entry.amount;
  }
  return { earned, spent };
}

export function extraFilterCount(filters: Filters) {
  return (filters.categories.length > 0 ? 1 : 0) + (filters.statuses.length > 0 ? 1 : 0) + (hasCustomRange(filters) ? 1 : 0);
}
