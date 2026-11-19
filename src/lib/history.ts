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
  attendance: "Chấm công",
  achievement: "Thành tích",
  redemption: "Đổi quà",
  adjustment: "Điều chỉnh",
};

export const STATUS_LABELS: Record<TxStatus, string> = {
  credited: "Đã cộng",
  issued: "Voucher sẵn sàng",
  used: "Đã dùng voucher",
};

export type Period = "month" | "last_month" | "ninety_days" | "all";
export type QuickFilter = "all" | "earned" | "spent" | "adjustments";

export const PERIOD_LABELS: Record<Period, string> = {
  month: "Tháng này",
  last_month: "Tháng trước",
  ninety_days: "90 ngày qua",
  all: "Tất cả",
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

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const monthKey = (date: string) => date.slice(0, 7);

function previousMonthKey(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

// Vietnamese date formats. "18 tháng 11, 2026"
export function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} tháng ${month}, ${year}`;
}

// "18/11"
export function formatShort(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${day}/${month}`;
}

// "Tháng 11/2026", for a "YYYY-MM" month
export function formatMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `Tháng ${number}/${year}`;
}

const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

// "Thứ Tư"
export function weekdayName(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

// "Thứ Tư, 11 tháng 11"
export function formatWeekday(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${weekdayName(date)}, ${day} tháng ${month}`;
}

// "Hôm nay · 18:20", "Hôm qua · 12:30", "2/11 · 10:15"
export function formatWhen(entry: Pick<HistoryEntry, "date" | "time">, today: string) {
  const day = entry.date === today ? "Hôm nay" : entry.date === shiftDate(today, -1) ? "Hôm qua" : formatShort(entry.date);
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
