import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPolledStore, post } from "./api";
import type { MonthSummary, TodayRow } from "./attendance-status";

export type BoardRow = TodayRow & { id: string; name: string; department: string; shift: { start: string; end: string }; notes: string[] };

export type TodayBoard = {
  loaded: boolean;
  today: string;
  now: string;
  scheduled: boolean;
  rows: BoardRow[];
  counts: { present: number; remote: number; late: number; notIn: number; notYet: number; onLeave: number };
};

const boardStore = createPolledStore<TodayBoard>(
  "/api/admin/attendance/today",
  { loaded: false, today: "", now: "", scheduled: true, rows: [], counts: { present: 0, remote: 0, late: 0, notIn: 0, notYet: 0, onLeave: 0 } },
  5000,
);

export function useTodayBoard() {
  return useSyncExternalStore(boardStore.subscribe, boardStore.getSnapshot, () => boardStore.initial);
}

export type MonthRow = MonthSummary & { id: string; name: string; department: string; remoteDays: number };
export type MonthReport = { month: string; previous: string; next: string | null; rows: MonthRow[] };

// Re-fetches when the month changes, and whenever `version` is bumped (after a correction).
export function useMonthReport(month: string | null, version: number) {
  const [report, setReport] = useState<MonthReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    const url = month ? `/api/admin/attendance/month?month=${month}` : "/api/admin/attendance/month";
    fetch(url, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setReport(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month, version]);
  return report;
}

export type CorrectionError =
  | "unknown_employee"
  | "invalid_date"
  | "future"
  | "invalid_time"
  | "invalid_reason"
  | "no_clock_in"
  | "out_before_in"
  | "invalid_kind";

export type CorrectionInput = { employeeId: string; date: string; kind: "clock_in" | "clock_out"; time: string; reason: string };

export function useCorrections() {
  const [version, setVersion] = useState(0);
  const submit = useCallback(async (input: CorrectionInput) => {
    const { ok, data } = await post<{ error?: CorrectionError; creditAdded?: boolean }>("/api/admin/attendance/corrections", input);
    if (ok) setVersion((value) => value + 1);
    return ok ? { ok: true as const, creditAdded: !!data.creditAdded } : { ok: false as const, error: data.error ?? "invalid_date" };
  }, []);
  return { version, submit };
}

export { formatMonth } from "./history";
