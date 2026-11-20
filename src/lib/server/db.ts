import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../demo-accounts";
import { formatShort } from "../history";
import { evaluatePerfectDay, PERFECT_DAY_CREDITS } from "../perfect-day";
import { MILESTONE_TARGETS, milestoneCredits, milestoneTitle } from "../progress";
import { isWeekday, nextWorkday, previousWorkdays, shiftDate, today } from "./clock";
import { hashPassword } from "./password";

const DB_PATH = process.env.WORKDAY_DB ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "workday.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL,
  shift_start TEXT NOT NULL,
  shift_end TEXT NOT NULL,
  remote_allowed INTEGER NOT NULL DEFAULT 0 CHECK (remote_allowed IN (0, 1))
);
CREATE TABLE IF NOT EXISTS attendance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  kind TEXT NOT NULL CHECK (kind IN ('clock_in', 'clock_out')),
  work_date TEXT NOT NULL,
  at_time TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('seed', 'office', 'remote', 'admin_correction')),
  ip TEXT,
  user_agent TEXT,
  note TEXT,
  corrected_by TEXT
);
CREATE TABLE IF NOT EXISTS office_networks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cidr TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clock_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  kind TEXT NOT NULL CHECK (kind IN ('clock_in', 'clock_out')),
  at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clock_attempts_recent ON clock_attempts (id DESC);
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
  issued_at TEXT NOT NULL,
  used_at TEXT,
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
  asked_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at TEXT,
  decided_by TEXT
);

-- Without these, every lookup read the whole table, so a request got slower the more people the company had
-- (at 1,500 people each page load was scanning ~37,000 punch rows). They go last because they need the tables above.
-- CREATE INDEX IF NOT EXISTS runs on every start, so existing databases pick them up with no migration.
CREATE INDEX IF NOT EXISTS attendance_by_person_day ON attendance_events (employee_id, work_date);
CREATE INDEX IF NOT EXISTS attendance_by_day ON attendance_events (work_date);
CREATE INDEX IF NOT EXISTS credits_by_person ON credit_transactions (employee_id, occurred_on);
CREATE INDEX IF NOT EXISTS redemptions_by_person ON redemptions (employee_id, reward_id);
`;

// Columns ending in _at hold "YYYY-MM-DD HH:MM" in Vietnam time; labels like "Today · 09:40" are built when read.
const SCHEMA_VERSION = 8;

// Databases at least this new are upgraded in place (keeping punches and office networks); older ones are rebuilt.
const OLDEST_MIGRATABLE = 7;
const MIGRATIONS: Record<number, string[]> = {
  8: [
    "ALTER TABLE attendance_events ADD COLUMN note TEXT",
    "ALTER TABLE attendance_events ADD COLUMN corrected_by TEXT",
  ],
};
const SCHEMA_KEY = `${SCHEMA_VERSION}:${SCHEMA}`;

const TABLES_IN_DELETE_ORDER = [
  "days_off",
  "leave_requests",
  "redemptions",
  "credit_transactions",
  "clock_attempts",
  "attendance_events",
  "rewards",
  "employees",
];

// Fictional history is laid out on the working days just before "today", so the demo always looks lived-in.
// With today = Wed 2026-11-11 (the test clock), these land on 2–10 November.
type DayScript = {
  in?: string;
  out?: string;
  off?: "leave";
  correctionTime?: string; // credited on the next working day, at this time
};

const HISTORY_DAYS = 7;

const ATTENDANCE_HISTORY: Record<string, DayScript[]> = {
  EMP001: [
    { in: "08:52", out: "18:03" },
    { in: "08:55", out: "18:00" },
    { in: "08:58", out: "18:05" },
    { in: "08:57", out: "18:02", correctionTime: "10:15" },
    { in: "09:06", out: "18:04" },
    { in: "08:54", out: "18:02" },
    { in: "08:53", out: "18:05" },
  ],
  EMP002: [
    { in: "08:56", out: "18:01" },
    {},
    { in: "08:59", out: "18:00" },
    { in: "08:52", out: "17:58" },
    { off: "leave" },
    { in: "08:57", out: "18:06" },
    { in: "08:58", out: "18:03" },
  ],
  EMP003: [
    { in: "08:50", out: "18:00" },
    { in: "08:58", out: "18:08" },
    { in: "08:55", out: "18:02" },
    { in: "08:59", out: "18:10" },
    { in: "09:00", out: "18:00" },
    { in: "08:56", out: "18:04" },
    { in: "08:57", out: "18:05" },
  ],
  EMP006: [
    { in: "08:57", out: "18:02" },
    { in: "09:15", out: "18:00" },
    { in: "08:55", out: "18:04" },
    { in: "08:59", out: "18:01" },
    {},
    { in: "08:54", out: "18:06" },
    { in: "08:58", out: "18:00" },
  ],
};

// Ordinary days that fill the rest of the current month before the scripted week, repeated in turn,
// so HR's month view doesn't show everyone absent for the first weeks.
const FILLER_DAYS: Record<string, DayScript[]> = {
  EMP001: [{ in: "08:54", out: "18:03" }, { in: "08:58", out: "18:01" }, { in: "08:56", out: "18:05" }, { in: "09:04", out: "18:02" }],
  EMP002: [{ in: "08:57", out: "18:02" }, { in: "08:59", out: "18:04" }, { in: "09:08", out: "18:00" }, { in: "08:55", out: "18:01" }],
  EMP003: [{ in: "08:55", out: "18:02" }, { in: "08:57", out: "18:00" }, { in: "08:59", out: "18:05" }],
  EMP006: [{ in: "08:56", out: "18:01" }, { in: "08:58", out: "18:03" }, { in: "09:02", out: "18:00" }],
};

// Last month's punches (no credits), so HR's "previous month" view has data. Each person has a different story:
// Daniel perfect all month, Alex never late (one late clock-out), Sarah late once, Minh absent one day.
function lastMonthDay(employeeId: string, index: number): DayScript {
  const day = { in: `08:5${1 + ((index * 3) % 9)}`, out: `18:0${(index * 7) % 10}` };
  if (employeeId === "EMP001" && index % 9 === 4) return { ...day, out: "18:25" };
  if (employeeId === "EMP002" && index === 6) return { ...day, in: "09:07" };
  if (employeeId === "EMP006" && index === 11) return {};
  return day;
}

function lastMonthWorkdays(todayDate: string) {
  const end = shiftDate(`${todayDate.slice(0, 7)}-01`, -1);
  const start = `${end.slice(0, 7)}-01`;
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) if (isWeekday(cursor)) days.push(cursor);
  return days;
}

// Working days from the 1st of today's month up to (not including) `before`, oldest first.
function earlierWorkdaysThisMonth(todayDate: string, before: string) {
  const monthStart = `${todayDate.slice(0, 7)}-01`;
  const days: string[] = [];
  for (let cursor = shiftDate(before, -1); cursor >= monthStart; cursor = shiftDate(cursor, -1)) {
    if (isWeekday(cursor)) days.unshift(cursor);
  }
  return days;
}

function seed(db: DatabaseSync) {
  const todayDate = today();
  const daysAgo = (days: number) => shiftDate(todayDate, -days);
  const workdays = previousWorkdays(todayDate, HISTORY_DAYS);
  const fillerDates = earlierWorkdaysThisMonth(todayDate, workdays[0]);

  // Today starts empty: everyone clocks in through the app.
  const employee = db.prepare("INSERT INTO employees (id, name, department, role, shift_start, shift_end, remote_allowed) VALUES (?, ?, ?, ?, '09:00', '18:00', ?)");
  employee.run("EMP001", "Alex Morgan", "Marketing", "Employee", 0);
  employee.run("EMP002", "Sarah Chen", "IT", "Employee", 1);
  employee.run("EMP003", "Daniel Lee", "HR", "Manager", 0);
  employee.run("EMP006", "Minh Tran", "Marketing", "Employee", 0);

  const event = db.prepare("INSERT INTO attendance_events (ext_id, employee_id, kind, work_date, at_time, source) VALUES (?, ?, ?, ?, ?, 'seed')");
  const credit = db.prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, ?, ?, ?, ?, ?, 'system')");
  const dayOff = db.prepare("INSERT INTO days_off (employee_id, date, kind, note) VALUES (?, ?, ?, ?)");
  const shift = { start: "09:00", end: "18:00" };

  // Credits are derived from the punches with the same rules the app applies at clock-out.
  for (const [employeeId, scripted] of Object.entries(ATTENDANCE_HISTORY)) {
    const perfectDaysByMonth = new Map<string, number>();
    const filler = FILLER_DAYS[employeeId];
    const plan = [
      ...fillerDates.map((date, index) => ({ date, day: filler[index % filler.length] })),
      ...scripted.map((day, index) => ({ date: workdays[index], day })),
    ];
    plan.forEach(({ date, day }) => {
      if (day.off) {
        dayOff.run(employeeId, date, day.off, "Nghỉ phép đã duyệt");
        return;
      }
      if (!day.in) return;
      event.run(`seed:${employeeId}:${date}:in`, employeeId, "clock_in", date, day.in);
      if (!day.out) return;
      event.run(`seed:${employeeId}:${date}:out`, employeeId, "clock_out", date, day.out);
      if (!evaluatePerfectDay(shift, day.in, day.out).qualifies) return;

      const month = date.slice(0, 7);
      const perfectDays = (perfectDaysByMonth.get(month) ?? 0) + 1;
      perfectDaysByMonth.set(month, perfectDays);
      if (day.correctionTime) {
        credit.run(employeeId, PERFECT_DAY_CREDITS, "adjustment", "Điều chỉnh công", nextWorkday(date), day.correctionTime, `correction:${employeeId}:${date}`);
      } else {
        credit.run(employeeId, PERFECT_DAY_CREDITS, "perfect_day", "Thưởng Perfect Day", date, day.out, `perfect-day:${employeeId}:${date}`);
      }
      if (MILESTONE_TARGETS.includes(perfectDays)) {
        credit.run(employeeId, milestoneCredits(perfectDays), "milestone", milestoneTitle(perfectDays), date, day.out, `milestone:${employeeId}:${month}:pd-${perfectDays}`);
      }
    });

    // Last month's punches, skipping any day the recent history above already covers (early in a month they overlap).
    const covered = new Set(plan.map(({ date }) => date));
    lastMonthWorkdays(todayDate).forEach((date, index) => {
      const day = lastMonthDay(employeeId, index);
      if (covered.has(date) || !day.in) return;
      event.run(`seed:${employeeId}:${date}:in`, employeeId, "clock_in", date, day.in);
      if (day.out) event.run(`seed:${employeeId}:${date}:out`, employeeId, "clock_out", date, day.out);
    });
  }

  credit.run("EMP001", 2, "perfect_day", "Thưởng Perfect Day", daysAgo(21), "18:04", "seed:EMP001:perfect-day-1");
  credit.run("EMP001", 2, "perfect_day", "Thưởng Perfect Day", daysAgo(20), "18:02", "seed:EMP001:perfect-day-2");
  credit.run("EMP001", 10, "milestone", "Mốc tuần", daysAgo(14), "17:00", "seed:EMP001:weekly");
  credit.run("EMP001", 7, "milestone", "Chuỗi Perfect Day", daysAgo(12), "17:00", "seed:EMP001:streak");
  credit.run("EMP002", 60, "milestone", "Mốc 20 ngày đi làm", daysAgo(28), "17:00", "seed:EMP002:milestone-20");
  credit.run("EMP002", 40, "milestone", "Chuỗi Perfect Day", daysAgo(18), "17:00", "seed:EMP002:streak");
  credit.run("EMP002", 17, "perfect_day", "Thưởng tuần", daysAgo(12), "17:00", "seed:EMP002:weekly-bonus");
  credit.run("EMP002", -75, "redemption", "Đổi quà: Bữa trưa cho hai người", daysAgo(1), "12:30", "redeem:WQ-3D71");
  credit.run("EMP003", 12, "milestone", "Chuỗi Perfect Day", daysAgo(20), "17:00", "seed:EMP003:streak");
  credit.run("EMP003", 7, "perfect_day", "Thưởng tuần", daysAgo(12), "17:00", "seed:EMP003:weekly-bonus");
  credit.run("EMP006", 150, "milestone", "Mốc đi làm theo quý", daysAgo(7), "17:00", "seed:EMP006:quarterly");
  credit.run("EMP006", -120, "redemption", "Đổi quà: Túi quà FADO", daysAgo(1), "13:10", "redeem:WQ-91AA");

  const reward = db.prepare("INSERT INTO rewards (id, name, kind, cost, stock) VALUES (?, ?, ?, ?, ?)");
  // `kind` is a code value ("Needs approval" is checked in redeem()), shown to people as a Vietnamese label.
  reward.run("coffee", "Giờ nghỉ cà phê", "Voucher", 40, 12);
  reward.run("lunch", "Bữa trưa cho hai người", "Voucher", 75, 4);
  reward.run("goodie-bag", "Túi quà FADO", "Gift", 120, 8);
  reward.run("personal-day", "Xin một ngày nghỉ", "Needs approval", 200, null);

  const redemption = db.prepare("INSERT INTO redemptions (employee_id, reward_id, code, cost, status, issued_at, used_at, used_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  redemption.run("EMP002", "lunch", "WQ-3D71", 75, "used", `${daysAgo(1)} 12:30`, `${daysAgo(1)} 12:45`, "cashier");
  redemption.run("EMP006", "goodie-bag", "WQ-91AA", 120, "issued", `${daysAgo(1)} 13:10`, null, null);

  const leave = db.prepare("INSERT INTO leave_requests (id, employee_id, note, cost, asked_at) VALUES (?, ?, ?, 200, ?)");
  leave.run("lr-1", "EMP002", `Xin nghỉ ngày ${formatShort(nextWorkday(todayDate, 7))}`, `${daysAgo(1)} 16:40`);
  leave.run("lr-2", "EMP006", `Xin nghỉ ngày ${formatShort(nextWorkday(todayDate, 12))}`, `${daysAgo(2)} 10:15`);
}

function seedUsers(db: DatabaseSync) {
  const insertUser = db.prepare("INSERT INTO users (id, email, name, employee_id, password_hash) VALUES (?, ?, ?, ?, ?)");
  const insertRole = db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)");
  for (const account of DEMO_ACCOUNTS) {
    insertUser.run(account.id, account.email, account.name, account.employeeId, hashPassword(DEMO_PASSWORD));
    for (const role of account.roles) insertRole.run(account.id, role);
  }
}

// The computer running the app counts as "office" out of the box, so the local demo works without setup.
// Real office networks are added by an admin. "Reset demo" never touches this list.
function seedOfficeNetworks(db: DatabaseSync) {
  const insert = db.prepare("INSERT INTO office_networks (cidr, label, added_at, added_by) VALUES (?, ?, ?, 'system')");
  const at = `${today()} 00:00`;
  insert.run("127.0.0.1/32", "Máy tính này (demo cục bộ)", at);
  insert.run("::1/128", "Máy tính này (demo cục bộ, IPv6)", at);
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
    const version = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    if (version >= OLDEST_MIGRATABLE && version < SCHEMA_VERSION) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (let step = version + 1; step <= SCHEMA_VERSION; step++) for (const statement of MIGRATIONS[step] ?? []) db.exec(statement);
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    const migrating = version < OLDEST_MIGRATABLE;
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
      if (migrating) seedOfficeNetworks(db);
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
