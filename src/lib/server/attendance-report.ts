// HR's view of attendance: who is in today, the month per person, manual corrections, and a spreadsheet export.
// Admin only. Employees never see each other's data.
import { summarizeMonth, todayStatus, lateBy, leftEarlyBy, type PunchSource } from "../attendance-status";
import { isValidTime, evaluatePerfectDay, PERFECT_DAY_CREDITS } from "../perfect-day";
import { isWeekday, now } from "./clock";
import { getDb, inTransaction } from "./db";
import { awardMilestones, loadMonth, shiftOf, type Db } from "./store";

type Employee = { id: string; name: string; department: string };

function employees(db: Db): Employee[] {
  return db
    .prepare("SELECT id, name, department FROM employees ORDER BY name")
    .all()
    .map((row) => ({ id: String(row.id), name: String(row.name), department: String(row.department) }));
}

type Punch = { time: string; source: PunchSource; note: string | null };

function punchesOn(db: Db, date: string) {
  const byEmployee = new Map<string, { in: Punch | null; out: Punch | null }>();
  for (const row of db.prepare("SELECT employee_id, kind, at_time, source, note FROM attendance_events WHERE work_date = ?").all(date)) {
    const entry = byEmployee.get(String(row.employee_id)) ?? { in: null, out: null };
    const punch = { time: String(row.at_time), source: String(row.source) as PunchSource, note: row.note === null ? null : String(row.note) };
    if (row.kind === "clock_in") entry.in = punch;
    else entry.out = punch;
    byEmployee.set(String(row.employee_id), entry);
  }
  return byEmployee;
}

export function getTodayBoard() {
  const db = getDb();
  const { date, time } = now();
  const scheduled = isWeekday(date);
  const punches = punchesOn(db, date);
  const onLeave = new Set(db.prepare("SELECT employee_id FROM days_off WHERE date = ?").all(date).map((row) => String(row.employee_id)));

  const rows = employees(db).map((employee) => {
    const punch = punches.get(employee.id) ?? { in: null, out: null };
    const shift = shiftOf(db, employee.id);
    const status = todayStatus({ shift, now: time, scheduled, onLeave: onLeave.has(employee.id), clockIn: punch.in, clockOut: punch.out });
    const notes = [punch.in?.note, punch.out?.note].filter((note): note is string => !!note);
    return { ...employee, shift, ...status, notes };
  });

  const present = rows.filter((row) => row.status === "working" || row.status === "left");
  return {
    today: date,
    now: time,
    scheduled,
    rows,
    counts: {
      present: present.length,
      remote: present.filter((row) => row.remote).length,
      late: present.filter((row) => row.lateMinutes > 0).length,
      notIn: rows.filter((row) => row.status === "not_in").length,
      notYet: rows.filter((row) => row.status === "not_yet").length,
      onLeave: rows.filter((row) => row.status === "on_leave").length,
    },
  };
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isReportableMonth(month: string) {
  return MONTH.test(month) && month <= now().date.slice(0, 7);
}

const shiftMonth = (month: string, delta: number) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
};

export function getMonthReport(month: string) {
  const db = getDb();
  const todayDate = now().date;
  const remoteDays = new Map(
    db
      .prepare("SELECT employee_id, COUNT(*) AS days FROM attendance_events WHERE kind = 'clock_in' AND source = 'remote' AND work_date LIKE ? GROUP BY employee_id")
      .all(`${month}-%`)
      .map((row) => [String(row.employee_id), Number(row.days)]),
  );
  const rows = employees(db).map((employee) => {
    const shift = shiftOf(db, employee.id);
    const days = loadMonth(db, employee.id, shift, todayDate, month);
    return { ...employee, ...summarizeMonth(days, shift, todayDate), remoteDays: remoteDays.get(employee.id) ?? 0 };
  });
  const current = todayDate.slice(0, 7);
  return { month, previous: shiftMonth(month, -1), next: month < current ? shiftMonth(month, 1) : null, rows };
}

// ---- Manual corrections ----

export type CorrectionError =
  | "unknown_employee"
  | "invalid_date"
  | "future"
  | "invalid_time"
  | "invalid_reason"
  | "no_clock_in"
  | "out_before_in";

// JavaScript quietly turns 2026-02-30 into 2 March, so the date must survive a round trip unchanged.
function isRealDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export type CorrectionResult = { ok: true; creditAdded: boolean } | { ok: false; error: CorrectionError };

// Sets one clock-in or clock-out, e.g. "forgot to clock out, left at 18:02". The reason is required and kept with
// the punch, which is marked as an admin correction everywhere it appears. If the corrected day now qualifies as a
// Perfect Day that was never credited, the credit is added once, as an adjustment; credits are never taken away.
export function correctPunch(args: { employeeId: string; date: string; kind: "clock_in" | "clock_out"; time: string; reason: string; actorId: string }): CorrectionResult {
  const reason = args.reason.trim();
  if (!isRealDate(args.date)) return { ok: false, error: "invalid_date" };
  if (!isValidTime(args.time)) return { ok: false, error: "invalid_time" };
  if (reason.length < 3 || reason.length > 200) return { ok: false, error: "invalid_reason" };

  return inTransaction((db) => {
    const { date: todayDate, time: nowTime } = now();
    if (args.date > todayDate || (args.date === todayDate && args.time > nowTime)) return { ok: false, error: "future" } as const;
    if (!db.prepare("SELECT 1 AS found FROM employees WHERE id = ?").get(args.employeeId)) return { ok: false, error: "unknown_employee" } as const;

    const existing = (kind: string) =>
      db.prepare("SELECT id, at_time FROM attendance_events WHERE employee_id = ? AND work_date = ? AND kind = ?").get(args.employeeId, args.date, kind);
    const clockIn = existing("clock_in");
    const clockOut = existing("clock_out");
    if (args.kind === "clock_out" && !clockIn) return { ok: false, error: "no_clock_in" } as const;
    if (args.kind === "clock_out" && args.time <= String(clockIn!.at_time)) return { ok: false, error: "out_before_in" } as const;
    if (args.kind === "clock_in" && clockOut && args.time >= String(clockOut.at_time)) return { ok: false, error: "out_before_in" } as const;

    const current = args.kind === "clock_in" ? clockIn : clockOut;
    if (current) {
      db.prepare("UPDATE attendance_events SET at_time = ?, source = 'admin_correction', note = ?, corrected_by = ? WHERE id = ?")
        .run(args.time, reason, args.actorId, Number(current.id));
    } else {
      db.prepare("INSERT INTO attendance_events (ext_id, employee_id, kind, work_date, at_time, source, note, corrected_by) VALUES (?, ?, ?, ?, ?, 'admin_correction', ?, ?)")
        .run(`app:${args.employeeId}:${args.date}:${args.kind === "clock_in" ? "in" : "out"}`, args.employeeId, args.kind, args.date, args.time, reason, args.actorId);
    }

    const finalIn = args.kind === "clock_in" ? args.time : clockIn ? String(clockIn.at_time) : null;
    const finalOut = args.kind === "clock_out" ? args.time : clockOut ? String(clockOut.at_time) : null;
    let creditAdded = false;
    if (finalIn && finalOut) {
      const shift = shiftOf(db, args.employeeId);
      const credited = db.prepare("SELECT 1 AS found FROM credit_transactions WHERE source_ref IN (?, ?)").get(`perfect-day:${args.employeeId}:${args.date}`, `correction:${args.employeeId}:${args.date}`);
      if (!credited && evaluatePerfectDay(shift, finalIn, finalOut).qualifies) {
        db.prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, 'adjustment', 'Điều chỉnh công', ?, ?, ?, ?)")
          .run(args.employeeId, PERFECT_DAY_CREDITS, todayDate, nowTime, `perfect-day:${args.employeeId}:${args.date}`, args.actorId);
        creditAdded = true;
        if (args.date.slice(0, 7) === todayDate.slice(0, 7)) awardMilestones(db, args.employeeId, shift, todayDate, nowTime);
      }
    }
    return { ok: true, creditAdded } as const;
  });
}

// ---- Spreadsheet export ----

const SOURCE_LABELS: Record<PunchSource, string> = { office: "Văn phòng", remote: "Từ xa", seed: "Dữ liệu cũ", admin_correction: "HR đã sửa" };

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One row per person per day, for HR's spreadsheet or payroll. Starts with a byte-order mark so Excel reads
// Vietnamese names correctly.
export function monthCsv(month: string) {
  const db = getDb();
  const todayDate = now().date;
  const header = ["Ngày", "Mã nhân viên", "Họ tên", "Phòng ban", "Trạng thái", "Giờ vào", "Giờ ra", "Phút trễ", "Phút về sớm", "Ghi nhận qua", "Ghi chú sửa công"];
  const lines = [header.map(csvCell).join(",")];

  const details = new Map<string, Punch>();
  for (const row of db.prepare("SELECT employee_id, kind, work_date, at_time, source, note FROM attendance_events WHERE work_date LIKE ?").all(`${month}-%`)) {
    details.set(`${row.employee_id}:${row.work_date}:${row.kind}`, { time: String(row.at_time), source: String(row.source) as PunchSource, note: row.note === null ? null : String(row.note) });
  }

  for (const employee of employees(db)) {
    const shift = shiftOf(db, employee.id);
    for (const day of loadMonth(db, employee.id, shift, todayDate, month)) {
      if (day.date > todayDate || (day.kind === "weekend" && !day.clockIn)) continue;
      const clockIn = details.get(`${employee.id}:${day.date}:clock_in`);
      const clockOut = details.get(`${employee.id}:${day.date}:clock_out`);
      const status =
        day.kind === "leave" ? "Nghỉ phép"
        : day.kind === "holiday" ? "Nghỉ lễ"
        : !day.clockIn ? (day.date === todayDate ? "Chưa vào" : "Vắng")
        : day.kind === "weekend" ? "Làm cuối tuần"
        : lateBy(shift, day.clockIn) > 0 ? "Trễ"
        : "Đúng giờ";
      const sources = [...new Set([clockIn?.source, clockOut?.source].filter((source): source is PunchSource => !!source))];
      lines.push(
        [
          day.date,
          employee.id,
          employee.name,
          employee.department,
          status,
          day.clockIn,
          day.clockOut,
          day.clockIn ? lateBy(shift, day.clockIn) : null,
          day.clockOut ? leftEarlyBy(shift, day.clockOut) : null,
          sources.map((source) => SOURCE_LABELS[source]).join(" / ") || null,
          [clockIn?.note, clockOut?.note].filter(Boolean).join(" / ") || null,
        ].map(csvCell).join(","),
      );
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
