// Test-only: creates many fictional employees so the load test can simulate a whole company.
// Reachable only through /api/test/employees, which doesn't exist unless the server runs with WORKDAY_TEST_CLOCK=1.
import { DEMO_PASSWORD } from "../demo-accounts";
import { PERFECT_DAY_CREDITS } from "../perfect-day";
import { previousWorkdays, today } from "./clock";
import type { InStatement, InValue } from "@libsql/client";
import { inTransaction } from "./db";
import { hashPassword } from "./password";

const MAX_EMPLOYEES = 5000;
const HISTORY_DAYS = 12;

export const LOAD_EMAIL = (index: number) => `load${String(index).padStart(4, "0")}@fado.demo`;

// Replaces any earlier load employees with `count` new ones, each with ~12 working days of punches and credits,
// so reading a wallet or a month costs what it would for a real person.
export async function createLoadEmployees(count: number) {
  const total = Math.max(0, Math.min(MAX_EMPLOYEES, Math.floor(count)));
  const shared = hashPassword(DEMO_PASSWORD); // hashing once keeps setup fast; every load user shares the demo password
  const dates = previousWorkdays(today(), HISTORY_DAYS);

  return inTransaction(async (db) => {
    const statements: InStatement[] = [
      { sql: "DELETE FROM sessions WHERE user_id LIKE 'u-load-%'" },
      { sql: "DELETE FROM user_roles WHERE user_id LIKE 'u-load-%'" },
      { sql: "DELETE FROM users WHERE id LIKE 'u-load-%'" },
      ...["clock_attempts", "attendance_events", "credit_transactions"].map((table) => ({ sql: `DELETE FROM ${table} WHERE employee_id LIKE 'LT%'` })),
      { sql: "DELETE FROM employees WHERE id LIKE 'LT%'" },
    ];
    const prepare = (sql: string) => ({ run: (...args: InValue[]) => void statements.push({ sql, args }) });

    const employee = prepare("INSERT INTO employees (id, name, department, role, shift_start, shift_end, remote_allowed) VALUES (?, ?, ?, 'Employee', '09:00', '18:00', 0)");
    const user = prepare("INSERT INTO users (id, email, name, employee_id, password_hash) VALUES (?, ?, ?, ?, ?)");
    const role = prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'employee')");
    const event = prepare("INSERT INTO attendance_events (ext_id, employee_id, kind, work_date, at_time, source) VALUES (?, ?, ?, ?, ?, 'seed')");
    const credit = prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, 'perfect_day', 'Thưởng Perfect Day', ?, '18:02', ?, 'system')");

    for (let index = 1; index <= total; index++) {
      const id = `LT${String(index).padStart(4, "0")}`;
      employee.run(id, `Nhân viên thử ${index}`, `Phòng ${(index % 8) + 1}`);
      user.run(`u-load-${id}`, LOAD_EMAIL(index), `Nhân viên thử ${index}`, id, shared);
      role.run(`u-load-${id}`);
      for (const date of dates) {
        event.run(`seed:${id}:${date}:in`, id, "clock_in", date, "08:56");
        event.run(`seed:${id}:${date}:out`, id, "clock_out", date, "18:02");
        credit.run(id, PERFECT_DAY_CREDITS, date, `perfect-day:${id}:${date}`);
      }
    }
    // Sent in chunks: one request for ~180,000 statements would be too big, one per statement far too slow.
    for (let start = 0; start < statements.length; start += 2000) await db.batch(statements.slice(start, start + 2000));
    return { created: total, historyDays: dates.length };
  });
}
