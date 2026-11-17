import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../demo-accounts";
import { evaluatePerfectDay, PERFECT_DAY_CREDITS } from "../perfect-day";
import { MILESTONE_TARGETS, milestoneCredits, milestoneTitle } from "../progress";
import { hashPassword } from "./password";

export const DEMO_DATE = "2026-11-11";

const DB_PATH = process.env.WORKDAY_DB ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "workday.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL,
  shift_start TEXT NOT NULL,
  shift_end TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  kind TEXT NOT NULL CHECK (kind IN ('clock_in', 'clock_out')),
  work_date TEXT NOT NULL,
  at_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  amount INTEGER NOT NULL CHECK (amount <> 0),
  type TEXT NOT NULL CHECK (type IN ('perfect_day', 'milestone', 'redemption', 'adjustment')),
  title TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  occurred_time TEXT NOT NULL,
  source_ref TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost > 0),
  stock INTEGER CHECK (stock IS NULL OR stock >= 0)
);
CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  reward_id TEXT NOT NULL REFERENCES rewards(id),
  code TEXT NOT NULL UNIQUE,
  cost INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued', 'used')),
  when_label TEXT NOT NULL,
  used_at_label TEXT,
  used_by TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  employee_id TEXT,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('employee', 'admin', 'cashier')),
  PRIMARY KEY (user_id, role)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS days_off (
  employee_id TEXT NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('leave', 'holiday')),
  note TEXT NOT NULL,
  PRIMARY KEY (employee_id, date)
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  note TEXT NOT NULL,
  cost INTEGER NOT NULL,
  asked_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_label TEXT,
  decided_by TEXT
);
`;

const SCHEMA_VERSION = 5;
const SCHEMA_KEY = `${SCHEMA_VERSION}:${SCHEMA}`;

const TABLES_IN_DELETE_ORDER = [
  "days_off",
  "leave_requests",
  "redemptions",
  "credit_transactions",
  "attendance_events",
  "rewards",
  "employees",
];

type DayScript = {
  date: string;
  in?: string;
  out?: string;
  off?: "leave";
  correction?: { on: string; time: string };
};

const ATTENDANCE_HISTORY: Record<string, DayScript[]> = {
  EMP001: [
    { date: "2026-11-02", in: "08:52", out: "18:03" },
    { date: "2026-11-03", in: "08:55", out: "18:00" },
    { date: "2026-11-04", in: "08:58", out: "18:05" },
    { date: "2026-11-05", in: "08:57", out: "18:02", correction: { on: "2026-11-06", time: "10:15" } },
    { date: "2026-11-06", in: "09:06", out: "18:04" },
    { date: "2026-11-09", in: "08:54", out: "18:02" },
    { date: "2026-11-10", in: "08:53", out: "18:05" },
  ],
  EMP002: [
    { date: "2026-11-02", in: "08:56", out: "18:01" },
    { date: "2026-11-03" },
    { date: "2026-11-04", in: "08:59", out: "18:00" },
    { date: "2026-11-05", in: "08:52", out: "17:58" },
    { date: "2026-11-06", off: "leave" },
    { date: "2026-11-09", in: "08:57", out: "18:06" },
    { date: "2026-11-10", in: "08:58", out: "18:03" },
  ],
  EMP003: [
    { date: "2026-11-02", in: "08:50", out: "18:00" },
    { date: "2026-11-03", in: "08:58", out: "18:08" },
    { date: "2026-11-04", in: "08:55", out: "18:02" },
    { date: "2026-11-05", in: "08:59", out: "18:10" },
    { date: "2026-11-06", in: "09:00", out: "18:00" },
    { date: "2026-11-09", in: "08:56", out: "18:04" },
    { date: "2026-11-10", in: "08:57", out: "18:05" },
  ],
};

const TODAY_CLOCK_IN: Record<string, string> = { EMP001: "08:55", EMP002: "09:03", EMP003: "08:58" };

function seed(db: DatabaseSync) {
  const employee = db.prepare("INSERT INTO employees (id, name, department, role, shift_start, shift_end) VALUES (?, ?, ?, ?, '09:00', '18:00')");
  employee.run("EMP001", "Alex Morgan", "Marketing", "Employee");
  employee.run("EMP002", "Sarah Chen", "IT", "Employee");
  employee.run("EMP003", "Daniel Lee", "HR", "Manager");
  employee.run("EMP006", "Minh Tran", "Marketing", "Employee");

  const event = db.prepare("INSERT INTO attendance_events (ext_id, employee_id, kind, work_date, at_time) VALUES (?, ?, ?, ?, ?)");
  const credit = db.prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, ?, ?, ?, ?, ?, 'system')");
  const dayOff = db.prepare("INSERT INTO days_off (employee_id, date, kind, note) VALUES (?, ?, ?, ?)");
  const shift = { start: "09:00", end: "18:00" };
  const month = DEMO_DATE.slice(0, 7);

  // Credits are derived from the punches with the same rules the app applies at clock-out.
  for (const [employeeId, days] of Object.entries(ATTENDANCE_HISTORY)) {
    let perfectDays = 0;
    for (const day of days) {
      if (day.off) {
        dayOff.run(employeeId, day.date, day.off, "Approved leave");
        continue;
      }
      if (!day.in) continue;
      event.run(`kiosk:${employeeId}:${day.date}:in`, employeeId, "clock_in", day.date, day.in);
      if (!day.out) continue;
      event.run(`kiosk:${employeeId}:${day.date}:out`, employeeId, "clock_out", day.date, day.out);
      if (!evaluatePerfectDay(shift, day.in, day.out).qualifies) continue;

      perfectDays += 1;
      if (day.correction) {
        credit.run(employeeId, PERFECT_DAY_CREDITS, "adjustment", "Attendance correction", day.correction.on, day.correction.time, `correction:${employeeId}:${day.date}`);
      } else {
        credit.run(employeeId, PERFECT_DAY_CREDITS, "perfect_day", "Perfect Day bonus", day.date, day.out, `perfect-day:${employeeId}:${day.date}`);
      }
      if (MILESTONE_TARGETS.includes(perfectDays)) {
        credit.run(employeeId, milestoneCredits(perfectDays), "milestone", milestoneTitle(perfectDays), day.date, day.out, `milestone:${employeeId}:${month}:pd-${perfectDays}`);
      }
    }
  }

  for (const [employeeId, time] of Object.entries(TODAY_CLOCK_IN)) {
    event.run(`kiosk:${employeeId}:${DEMO_DATE}:in`, employeeId, "clock_in", DEMO_DATE, time);
  }

  credit.run("EMP001", 2, "perfect_day", "Perfect Day bonus", "2026-10-21", "18:04", "seed:EMP001:perfect-day-1021");
  credit.run("EMP001", 2, "perfect_day", "Perfect Day bonus", "2026-10-22", "18:02", "seed:EMP001:perfect-day-1022");
  credit.run("EMP001", 10, "milestone", "Weekly milestone", "2026-10-28", "17:00", "seed:EMP001:weekly-1028");
  credit.run("EMP001", 7, "milestone", "Perfect Day streak", "2026-10-30", "17:00", "seed:EMP001:streak");
  credit.run("EMP002", 60, "milestone", "20 attendance days milestone", "2026-10-14", "17:00", "seed:EMP002:milestone-20");
  credit.run("EMP002", 40, "milestone", "Perfect Day streak", "2026-10-24", "17:00", "seed:EMP002:streak");
  credit.run("EMP002", 17, "perfect_day", "Weekly bonus", "2026-10-30", "17:00", "seed:EMP002:weekly-bonus");
  credit.run("EMP002", -75, "redemption", "Lunch for two voucher", "2026-11-10", "12:30", "redeem:WQ-3D71");
  credit.run("EMP003", 12, "milestone", "Perfect Day streak", "2026-10-22", "17:00", "seed:EMP003:streak");
  credit.run("EMP003", 7, "perfect_day", "Weekly bonus", "2026-10-30", "17:00", "seed:EMP003:weekly-bonus");
  credit.run("EMP006", 150, "milestone", "Quarterly attendance milestone", "2026-11-04", "17:00", "seed:EMP006:quarterly");
  credit.run("EMP006", -120, "redemption", "FADO goodie bag voucher", "2026-11-10", "13:10", "redeem:WQ-91AA");

  const reward = db.prepare("INSERT INTO rewards (id, name, kind, cost, stock) VALUES (?, ?, ?, ?, ?)");
  reward.run("coffee", "Coffee break", "Voucher", 40, 12);
  reward.run("lunch", "Lunch for two", "Voucher", 75, 4);
  reward.run("goodie-bag", "FADO goodie bag", "Gift", 120, 8);
  reward.run("personal-day", "Personal day request", "Needs approval", 200, null);

  const redemption = db.prepare("INSERT INTO redemptions (employee_id, reward_id, code, cost, status, when_label, used_at_label, used_by) VALUES (?, ?, ?, ?, ?, 'Yesterday', ?, ?)");
  redemption.run("EMP002", "lunch", "WQ-3D71", 75, "used", "Yesterday", "cashier");
  redemption.run("EMP006", "goodie-bag", "WQ-91AA", 120, "issued", null, null);

  const leave = db.prepare("INSERT INTO leave_requests (id, employee_id, note, cost, asked_label) VALUES (?, ?, ?, 200, ?)");
  leave.run("lr-1", "EMP002", "Requesting 20 Nov", "Today · 09:40");
  leave.run("lr-2", "EMP006", "Requesting 27 Nov", "Yesterday");
}

function seedUsers(db: DatabaseSync) {
  const insertUser = db.prepare("INSERT INTO users (id, email, name, employee_id, password_hash) VALUES (?, ?, ?, ?, ?)");
  const insertRole = db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)");
  for (const account of DEMO_ACCOUNTS) {
    insertUser.run(account.id, account.email, account.name, account.employeeId, hashPassword(DEMO_PASSWORD));
    for (const role of account.roles) insertRole.run(account.id, role);
  }
}

function clearBusinessData(db: DatabaseSync) {
  for (const table of TABLES_IN_DELETE_ORDER) db.exec(`DELETE FROM ${table}`);
  db.exec("DELETE FROM sqlite_sequence");
}

const globalForDb = globalThis as unknown as { __workdayDb?: DatabaseSync; __workdaySchema?: string };

export function getDb() {
  if (globalForDb.__workdayDb && globalForDb.__workdaySchema !== SCHEMA_KEY) {
    globalForDb.__workdayDb.close();
    globalForDb.__workdayDb = undefined;
  }
  if (!globalForDb.__workdayDb) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    const migrating = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0) < SCHEMA_VERSION;
    if (migrating) {
      db.exec("PRAGMA foreign_keys = OFF");
      for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
        db.exec(`DROP TABLE IF EXISTS "${String(row.name)}"`);
      }
      db.exec("PRAGMA foreign_keys = ON");
    }
    db.exec(SCHEMA);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!db.prepare("SELECT 1 AS found FROM employees LIMIT 1").get()) seed(db);
      if (!db.prepare("SELECT 1 AS found FROM users LIMIT 1").get()) seedUsers(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    globalForDb.__workdayDb = db;
    globalForDb.__workdaySchema = SCHEMA_KEY;
  }
  return globalForDb.__workdayDb;
}

export function inTransaction<T>(work: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function resetDatabase() {
  inTransaction((db) => {
    clearBusinessData(db);
    seed(db);
  });
}
