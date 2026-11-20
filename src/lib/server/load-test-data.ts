// Test-only: creates many fictional employees so the load test can simulate a whole company.
// Reachable only through /api/test/employees, which doesn't exist unless the server runs with WORKDAY_TEST_CLOCK=1.
import { DEMO_PASSWORD } from "../demo-accounts";
import { PERFECT_DAY_CREDITS } from "../perfect-day";
import { previousWorkdays, today } from "./clock";
import { inTransaction } from "./db";
import { hashPassword } from "./password";

const MAX_EMPLOYEES = 5000;
const HISTORY_DAYS = 12;

export const LOAD_EMAIL = (index: number) => `load${String(index).padStart(4, "0")}@fado.demo`;

// Replaces any earlier load employees with `count` new ones, each with ~12 working days of punches and credits,
// so reading a wallet or a month costs what it would for a real person.
export function createLoadEmployees(count: number) {
  const total = Math.max(0, Math.min(MAX_EMPLOYEES, Math.floor(count)));
  const shared = hashPassword(DEMO_PASSWORD); // hashing once keeps setup fast; every load user shares the demo password
  const dates = previousWorkdays(today(), HISTORY_DAYS);

  return inTransaction((db) => {
    db.exec("DELETE FROM sessions WHERE user_id LIKE 'u-load-%'");
    db.exec("DELETE FROM user_roles WHERE user_id LIKE 'u-load-%'");
    db.exec("DELETE FROM users WHERE id LIKE 'u-load-%'");
    for (const table of ["clock_attempts", "attendance_events", "credit_transactions"]) db.exec(`DELETE FROM ${table} WHERE employee_id LIKE 'LT%'`);
    db.exec("DELETE FROM employees WHERE id LIKE 'LT%'");

    const employee = db.prepare("INSERT INTO employees (id, name, department, role, shift_start, shift_end, remote_allowed) VALUES (?, ?, ?, 'Employee', '09:00', '18:00', 0)");
    const user = db.prepare("INSERT INTO users (id, email, name, employee_id, password_hash) VALUES (?, ?, ?, ?, ?)");
    const role = db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'employee')");
    const event = db.prepare("INSERT INTO attendance_events (ext_id, employee_id, kind, work_date, at_time, source) VALUES (?, ?, ?, ?, ?, 'seed')");
    const credit = db.prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, 'perfect_day', 'Thưởng Perfect Day', ?, '18:02', ?, 'system')");

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
    return { created: total, historyDays: dates.length };
  });
}
