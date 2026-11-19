import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  DEFAULT_FILTERS,
  extraFilterCount,
  formatDay,
  formatWhen,
  groupByDay,
  monthTotals,
} from "../src/lib/history.ts";

const TODAY = "2026-11-11";

const entry = (id, date, time, amount, category, status = "credited") => ({ id, date, time, amount, category, status, title: `entry ${id}` });

const ENTRIES = [
  entry("1", "2026-11-11", "18:05", 2, "attendance"),
  entry("2", "2026-11-10", "18:05", 4, "achievement"),
  entry("3", "2026-11-10", "12:30", -75, "redemption", "used"),
  entry("4", "2026-11-06", "10:15", 2, "adjustment"),
  entry("5", "2026-10-22", "18:02", 2, "attendance"),
  entry("6", "2026-10-14", "17:00", 60, "achievement"),
];

const ids = (list) => list.map((item) => item.id);
const filter = (patch) => ids(applyFilters(ENTRIES, { ...DEFAULT_FILTERS, ...patch }, TODAY));

test("the default view is the current month", () => {
  assert.deepEqual(filter({}), ["1", "2", "3", "4"]);
});

test("period presets: last month, last 90 days, all time", () => {
  assert.deepEqual(filter({ period: "last_month" }), ["5", "6"]);
  assert.deepEqual(filter({ period: "ninety_days" }), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(filter({ period: "all" }), ["1", "2", "3", "4", "5", "6"]);
});

test("last month rolls back across a year boundary", () => {
  const december = [entry("a", "2025-12-20", "09:00", 5, "attendance"), entry("b", "2026-01-03", "09:00", 5, "attendance")];
  const result = applyFilters(december, { ...DEFAULT_FILTERS, period: "last_month" }, "2026-01-15");
  assert.deepEqual(ids(result), ["a"]);
});

test("quick chips: earned, spent, adjustments", () => {
  assert.deepEqual(filter({ quick: "earned" }), ["1", "2", "4"]);
  assert.deepEqual(filter({ quick: "spent" }), ["3"]);
  assert.deepEqual(filter({ quick: "adjustments" }), ["4"]);
});

test("category and status filters work across any period", () => {
  assert.deepEqual(filter({ period: "all", categories: ["attendance"] }), ["1", "5"]);
  assert.deepEqual(filter({ period: "all", categories: ["attendance", "adjustment"] }), ["1", "4", "5"]);
  assert.deepEqual(filter({ period: "all", statuses: ["used"] }), ["3"]);
  assert.deepEqual(filter({ period: "all", statuses: ["issued"] }), []);
});

test("filters combine with AND", () => {
  assert.deepEqual(filter({ quick: "earned", categories: ["achievement"] }), ["2"]);
  assert.deepEqual(filter({ quick: "spent", categories: ["attendance"] }), []);
});

test("a custom date range overrides the period dropdown and is inclusive", () => {
  assert.deepEqual(filter({ period: "month", from: "2026-10-01", to: "2026-10-31" }), ["5", "6"]);
  assert.deepEqual(filter({ from: "2026-11-06", to: "2026-11-10" }), ["2", "3", "4"]);
  assert.deepEqual(filter({ from: "2026-11-10" }), ["1", "2", "3"], "open-ended end date");
  assert.deepEqual(filter({ to: "2026-10-22" }), ["5", "6"], "open-ended start date");
  assert.deepEqual(filter({ from: "2026-11-10", to: "2026-11-01" }), [], "reversed range matches nothing");
});

test("entries are grouped by day, keeping their order", () => {
  const groups = groupByDay(applyFilters(ENTRIES, DEFAULT_FILTERS, TODAY));
  assert.deepEqual(groups.map((group) => [group.date, group.entries.length]), [["2026-11-11", 1], ["2026-11-10", 2], ["2026-11-06", 1]]);
  assert.deepEqual(groupByDay([]), []);
});

test("month totals count only the current month", () => {
  assert.deepEqual(monthTotals(ENTRIES, TODAY), { earned: 8, spent: 75 });
  assert.deepEqual(monthTotals([], TODAY), { earned: 0, spent: 0 });
});

test("the badge counts active groups of extra filters, not individual picks", () => {
  assert.equal(extraFilterCount(DEFAULT_FILTERS), 0);
  assert.equal(extraFilterCount({ ...DEFAULT_FILTERS, categories: ["attendance", "adjustment"] }), 1);
  assert.equal(extraFilterCount({ ...DEFAULT_FILTERS, categories: ["attendance"], statuses: ["used"], from: "2026-10-01" }), 3);
  assert.equal(extraFilterCount({ ...DEFAULT_FILTERS, quick: "spent", period: "all" }), 0, "chips and the dropdown are not extras");
});

test("dates read naturally, including across a month boundary", () => {
  assert.equal(formatDay("2026-11-06"), "6 tháng 11, 2026");
  assert.equal(formatWhen({ date: "2026-11-11", time: "18:05" }, TODAY), "Hôm nay · 18:05");
  assert.equal(formatWhen({ date: "2026-11-10", time: "12:30" }, TODAY), "Hôm qua · 12:30");
  assert.equal(formatWhen({ date: "2026-11-06", time: "10:15" }, TODAY), "6/11 · 10:15");
  assert.equal(formatWhen({ date: "2026-11-30", time: "09:00" }, "2026-12-01"), "Hôm qua · 09:00");
});
