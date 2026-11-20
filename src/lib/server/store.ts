import { getDb, inTransaction, type Db } from "./db";
import { locate, recordAttempt, whereAmI, type AttemptReason, type PunchKind } from "./attendance";
import type { ClientIp } from "./client-ip";
import { now, stamp, today } from "./clock";
import { formatStamp, type Category, type HistoryEntry } from "../history";
import { formatIp } from "../ip";
import { classifyArrival, evaluatePerfectDay, PERFECT_DAY_CREDITS, perfectDayWindow, type Arrival, type Shift } from "../perfect-day";
import {
  buildMonth,
  MILESTONE_TARGETS,
  milestoneCredits,
  milestonesReached,
  milestoneTitle,
  monthStats,
  nextMilestone,
  perfectDayCount,
  type DayOff,
  type Punches,
} from "../progress";
import { nextRewardTarget } from "../reward-target";

export type { Db };

const CATEGORY_BY_TYPE: Record<string, Category> = {
  perfect_day: "attendance",
  milestone: "achievement",
  redemption: "redemption",
  adjustment: "adjustment",
};

const normalizeCode = (code: string) => code.trim().toUpperCase();

async function balanceOf(db: Db, employeeId: string) {
  const row = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM credit_transactions WHERE employee_id = ?").get(employeeId);
  return Number(row?.balance ?? 0);
}

export async function getWallet(employeeId: string, client: ClientIp) {
  const db = await getDb();
  const { date: todayDate, time } = now();
  // Independent reads run together: against a hosted database each one is a network round trip.
  const [events, employee, perfectDayRow, ledgerRows, voucher, balance, location] = await Promise.all([
    db.prepare("SELECT kind, at_time, source FROM attendance_events WHERE employee_id = ? AND work_date = ?").all(employeeId, todayDate),
    db.prepare("SELECT shift_start, shift_end FROM employees WHERE id = ?").get(employeeId),
    db.prepare("SELECT 1 AS found FROM credit_transactions WHERE source_ref = ?").get(`perfect-day:${employeeId}:${todayDate}`),
    db
      .prepare(
        `SELECT t.id, t.amount, t.type, t.title, t.occurred_on, t.occurred_time, r.status AS voucher_status
         FROM credit_transactions t LEFT JOIN redemptions r ON t.source_ref = 'redeem:' || r.code
         WHERE t.employee_id = ?
         ORDER BY t.occurred_on DESC, t.occurred_time DESC, t.id DESC`,
      )
      .all(employeeId),
    db.prepare("SELECT code, issued_at, used_at FROM redemptions WHERE employee_id = ? AND reward_id = 'coffee' ORDER BY id DESC LIMIT 1").get(employeeId),
    balanceOf(db, employeeId),
    whereAmI(employeeId, client),
  ]);
  const clockIn = events.find((event) => event.kind === "clock_in");
  const out = events.find((event) => event.kind === "clock_out");
  const shift = { start: String(employee?.shift_start ?? "09:00"), end: String(employee?.shift_end ?? "18:00") };
  const perfectDay = !!perfectDayRow;
  const ledger: HistoryEntry[] = ledgerRows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount),
    title: String(row.title),
    date: String(row.occurred_on),
    time: String(row.occurred_time),
    category: CATEGORY_BY_TYPE[String(row.type)],
    status: row.type === "redemption" ? (row.voucher_status === "used" ? "used" : "issued") : "credited",
  }));

  return {
    today: todayDate,
    now: time,
    clockedOut: !!out,
    clockIn: clockIn ? String(clockIn.at_time) : null,
    clockInMode: clockIn ? String(clockIn.source) : null,
    clockOut: out ? String(out.at_time) : null,
    location,
    arrival: clockIn ? classifyArrival(shift, String(clockIn.at_time)) : null,
    perfectDay,
    shift,
    window: perfectDayWindow(shift),
    balance,
    ledger,
    voucher: voucher ? String(voucher.code) : null,
    voucherIssuedAt: voucher ? formatStamp(String(voucher.issued_at), todayDate) : null,
    voucherUsedAt: voucher?.used_at ? formatStamp(String(voucher.used_at), todayDate) : null,
  };
}

export async function shiftOf(db: Db, employeeId: string): Promise<Shift> {
  const employee = await db.prepare("SELECT shift_start, shift_end FROM employees WHERE id = ?").get(employeeId);
  return { start: String(employee?.shift_start ?? "09:00"), end: String(employee?.shift_end ?? "18:00") };
}

// The employee's calendar for `month` (default: the current month), as their Progress page shows it.
export async function loadMonth(db: Db, employeeId: string, shift: Shift, todayDate: string, month = todayDate.slice(0, 7)) {
  const [punchRows, dayOffRows] = await Promise.all([
    db.prepare("SELECT kind, work_date, at_time FROM attendance_events WHERE employee_id = ? AND work_date LIKE ?").all(employeeId, `${month}-%`),
    db.prepare("SELECT date, kind FROM days_off WHERE employee_id = ? AND date LIKE ?").all(employeeId, `${month}-%`),
  ]);
  const punches: Record<string, Punches> = {};
  for (const row of punchRows) {
    const punch = (punches[String(row.work_date)] ??= { in: null, out: null });
    if (row.kind === "clock_in") punch.in = String(row.at_time);
    else punch.out = String(row.at_time);
  }
  const daysOff: Record<string, DayOff> = {};
  for (const row of dayOffRows) daysOff[String(row.date)] = row.kind as DayOff;
  return buildMonth({ month, today: todayDate, shift, punches, daysOff });
}

export async function awardMilestones(db: Db, employeeId: string, shift: Shift, todayDate: string, time: string) {
  const month = todayDate.slice(0, 7);
  const reached = milestonesReached(perfectDayCount(await loadMonth(db, employeeId, shift, todayDate)));
  const insert = db.prepare("INSERT OR IGNORE INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, 'milestone', ?, ?, ?, ?, 'system')");
  for (const target of reached) {
    await insert.run(employeeId, milestoneCredits(target), milestoneTitle(target), todayDate, time, `milestone:${employeeId}:${month}:pd-${target}`);
  }
}

export async function getProgress(employeeId: string) {
  const db = await getDb();
  const todayDate = today();
  const month = todayDate.slice(0, 7);
  const shift = await shiftOf(db, employeeId);
  const [days, reachedRows, voucher, balance] = await Promise.all([
    loadMonth(db, employeeId, shift, todayDate),
    db
      .prepare("SELECT id, title, amount, occurred_on FROM credit_transactions WHERE employee_id = ? AND type = 'milestone' AND occurred_on LIKE ? ORDER BY occurred_on DESC, occurred_time DESC, id DESC")
      .all(employeeId, `${month}-%`),
    db.prepare("SELECT 1 AS found FROM redemptions WHERE employee_id = ? AND reward_id = 'coffee' LIMIT 1").get(employeeId),
    balanceOf(db, employeeId),
  ]);
  const stats = monthStats(days, todayDate);
  const reached = reachedRows.map((row) => ({ id: String(row.id), title: String(row.title), credits: Number(row.amount), date: String(row.occurred_on) }));
  const target = nextRewardTarget(!!voucher);

  return {
    today: todayDate,
    month,
    shift,
    window: perfectDayWindow(shift),
    days,
    stats: { ...stats, milestonesReached: reached.length },
    milestones: {
      reached,
      ladder: MILESTONE_TARGETS.map((target) => ({ target, reached: target <= stats.perfectDays })),
      next: nextMilestone(stats.perfectDays),
    },
    reward: { name: target.name, icon: target.icon, cost: target.cost, balance, remaining: Math.max(0, target.cost - balance) },
  };
}

export type Punch = { client: ClientIp; userAgent: string | null };
type Blocked = { ok: false; error: "not_office_network" | "no_client_ip"; ip: string | null };

async function insertPunch(db: Db, employeeId: string, kind: PunchKind, date: string, time: string, mode: "office" | "remote", punch: Punch) {
  await db
    .prepare("INSERT INTO attendance_events (ext_id, employee_id, kind, work_date, at_time, source, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(`app:${employeeId}:${date}:${kind === "clock_in" ? "in" : "out"}`, employeeId, kind, date, time, mode, punch.client.ip ? formatIp(punch.client.ip) : null, punch.userAgent);
}

export type PunchSource = "office" | "remote" | "seed" | "admin_correction";

export type ClockInResult =
  | { ok: true; alreadyClockedIn: boolean; time: string; mode: PunchSource; arrival: Arrival }
  | Blocked;

// Every attempt is logged, accepted or not, so the admin can see why someone couldn't clock in.
export function clockIn(employeeId: string, punch: Punch): Promise<ClockInResult> {
  return inTransaction(async (db) => {
    const { date: todayDate, time } = now();
    const log = (accepted: boolean, reason: AttemptReason) => recordAttempt(db, { employeeId, kind: "clock_in", client: punch.client, userAgent: punch.userAgent, accepted, reason });
    const where = await locate(db, employeeId, punch.client);
    if (where.verdict === "blocked") {
      await log(false, where.reason);
      return { ok: false, error: where.reason, ip: punch.client.ip ? formatIp(punch.client.ip) : null } as const;
    }

    const shift = await shiftOf(db, employeeId);
    const existing = await db.prepare("SELECT at_time, source FROM attendance_events WHERE employee_id = ? AND work_date = ? AND kind = 'clock_in'").get(employeeId, todayDate);
    if (existing) {
      await log(true, "already_clocked_in");
      const at = String(existing.at_time);
      return { ok: true, alreadyClockedIn: true, time: at, mode: String(existing.source) as PunchSource, arrival: classifyArrival(shift, at) } as const;
    }

    await insertPunch(db, employeeId, "clock_in", todayDate, time, where.verdict, punch);
    await log(true, where.verdict === "office" ? "ok_office" : "ok_remote");
    return { ok: true, alreadyClockedIn: false, time, mode: where.verdict, arrival: classifyArrival(shift, time) } as const;
  });
}

export type ClockOutResult =
  | { ok: true; alreadyClockedOut: boolean; qualifies: boolean; reason: string; time: string }
  | { ok: false; error: "no_clock_in"; ip: string | null }
  | Blocked;

// Clock-out gets the same network check: otherwise you could leave at 17:00 and clock out from home at 18:05.
// The time always comes from the server's clock, never from the browser.
export function clockOut(employeeId: string, punch: Punch): Promise<ClockOutResult> {
  return inTransaction(async (db) => {
    const { date: todayDate, time } = now();
    const log = (accepted: boolean, reason: AttemptReason) => recordAttempt(db, { employeeId, kind: "clock_out", client: punch.client, userAgent: punch.userAgent, accepted, reason });
    const ip = punch.client.ip ? formatIp(punch.client.ip) : null;
    const where = await locate(db, employeeId, punch.client);
    if (where.verdict === "blocked") {
      await log(false, where.reason);
      return { ok: false, error: where.reason, ip } as const;
    }

    const employee = await db.prepare("SELECT shift_start, shift_end FROM employees WHERE id = ?").get(employeeId);
    const clockInRow = await db.prepare("SELECT at_time FROM attendance_events WHERE employee_id = ? AND work_date = ? AND kind = 'clock_in'").get(employeeId, todayDate);
    if (!employee || !clockInRow) {
      await log(false, "no_clock_in");
      return { ok: false, error: "no_clock_in", ip } as const;
    }

    const existing = await db.prepare("SELECT at_time FROM attendance_events WHERE employee_id = ? AND work_date = ? AND kind = 'clock_out'").get(employeeId, todayDate);
    if (existing) {
      await log(true, "already_clocked_out");
      return { ok: true, alreadyClockedOut: true, qualifies: false, reason: "already_clocked_out", time: String(existing.at_time) } as const;
    }

    const result = evaluatePerfectDay(
      { start: String(employee.shift_start), end: String(employee.shift_end) },
      String(clockInRow.at_time),
      time,
    );

    await insertPunch(db, employeeId, "clock_out", todayDate, time, where.verdict, punch);
    await log(true, where.verdict === "office" ? "ok_office" : "ok_remote");

    if (result.qualifies) {
      await db
        .prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, 'perfect_day', 'Thưởng Perfect Day', ?, ?, ?, 'system')")
        .run(employeeId, PERFECT_DAY_CREDITS, todayDate, time, `perfect-day:${employeeId}:${todayDate}`);
      await awardMilestones(db, employeeId, await shiftOf(db, employeeId), todayDate, time);
    }
    return { ok: true, alreadyClockedOut: false, qualifies: result.qualifies, reason: result.reason, time } as const;
  });
}

export type RedeemResult =
  | { ok: true; code: string }
  | { ok: false; error: "unknown_reward" | "not_redeemable" | "insufficient_credits" | "out_of_stock" };

async function newVoucherCode(db: Db) {
  for (;;) {
    const code = `WQ-${Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, "0")}`;
    if (!(await db.prepare("SELECT 1 AS found FROM redemptions WHERE code = ?").get(code))) return code;
  }
}

export function redeem(rewardId: string, employeeId: string): Promise<RedeemResult> {
  return inTransaction(async (db) => {
    const reward = await db.prepare("SELECT id, name, kind, cost FROM rewards WHERE id = ?").get(rewardId);
    if (!reward) return { ok: false, error: "unknown_reward" } as const;
    if (reward.kind === "Needs approval") return { ok: false, error: "not_redeemable" } as const;

    const cost = Number(reward.cost);
    if ((await balanceOf(db, employeeId)) < cost) return { ok: false, error: "insufficient_credits" } as const;

    const stock = await db.prepare("UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock > 0").run(rewardId);
    if (Number(stock.changes) !== 1) return { ok: false, error: "out_of_stock" } as const;

    const code = await newVoucherCode(db);
    const { date, time } = now();
    await db.prepare("INSERT INTO redemptions (employee_id, reward_id, code, cost, status, issued_at) VALUES (?, ?, ?, ?, 'issued', ?)")
      .run(employeeId, rewardId, code, cost, `${date} ${time}`);
    await db.prepare("INSERT INTO credit_transactions (employee_id, amount, type, title, occurred_on, occurred_time, source_ref, actor) VALUES (?, ?, 'redemption', ?, ?, ?, ?, ?)")
      .run(employeeId, -cost, `Đổi quà: ${String(reward.name)}`, date, time, `redeem:${code}`, employeeId);
    return { ok: true, code } as const;
  });
}

export type VoucherInfo =
  | { status: "invalid" }
  | { status: "issued" | "used"; code: string; reward: string; employee: string; employeeId: string; cost: number; usedAt: string | null };

export async function checkVoucher(code: string): Promise<VoucherInfo> {
  const row = await (await getDb())
    .prepare(
      `SELECT r.code, r.status, r.cost, r.used_at, w.name AS reward, e.name AS employee, e.id AS employee_id
       FROM redemptions r JOIN rewards w ON w.id = r.reward_id JOIN employees e ON e.id = r.employee_id
       WHERE r.code = ?`,
    )
    .get(normalizeCode(code));
  if (!row) return { status: "invalid" };
  return {
    status: row.status as "issued" | "used",
    code: String(row.code),
    reward: String(row.reward),
    employee: String(row.employee),
    employeeId: String(row.employee_id),
    cost: Number(row.cost),
    usedAt: row.used_at ? formatStamp(String(row.used_at), today()) : null,
  };
}

export async function consumeVoucher(code: string, actorId: string) {
  const normalized = normalizeCode(code);
  const changed = await inTransaction((db) =>
    db.prepare("UPDATE redemptions SET status = 'used', used_at = ?, used_by = ? WHERE code = ? AND status = 'issued'").run(stamp(), actorId, normalized),
  );
  return { consumed: Number(changed.changes) === 1, voucher: await checkVoucher(normalized) };
}

export async function getAdminOverview() {
  const db = await getDb();
  const todayDate = today();
  const [leaveRows, redemptionRows, catalogueRows] = await Promise.all([
    db
      .prepare(
        `SELECT l.id, l.note, l.cost, l.asked_at, l.status, l.decided_at, e.name, e.id AS employee_id, e.department
         FROM leave_requests l JOIN employees e ON e.id = l.employee_id ORDER BY l.id`,
      )
      .all(),
    db
      .prepare(
        `SELECT r.id, r.code, r.cost, r.status, r.issued_at, w.name AS reward, e.name, e.id AS employee_id
         FROM redemptions r JOIN rewards w ON w.id = r.reward_id JOIN employees e ON e.id = r.employee_id ORDER BY r.id DESC`,
      )
      .all(),
    db.prepare("SELECT id, name, kind, cost, stock FROM rewards ORDER BY cost").all(),
  ]);
  const leave = leaveRows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    empId: String(row.employee_id),
    dept: String(row.department),
    note: String(row.note),
    cost: Number(row.cost),
    asked: formatStamp(String(row.asked_at), todayDate),
    status: String(row.status) as "pending" | "approved" | "rejected",
    decidedAt: row.decided_at ? formatStamp(String(row.decided_at), todayDate) : null,
  }));
  const redemptions = redemptionRows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    empId: String(row.employee_id),
    reward: String(row.reward),
    code: String(row.code),
    cost: Number(row.cost),
    when: formatStamp(String(row.issued_at), todayDate),
    status: String(row.status) as "issued" | "used",
  }));
  const catalogue = catalogueRows.map((row) => ({ id: String(row.id), name: String(row.name), kind: String(row.kind), cost: Number(row.cost), stock: row.stock === null ? null : Number(row.stock) }));

  return {
    today: todayDate,
    leave,
    redemptions,
    catalogue,
    stats: {
      pendingLeave: leave.filter((item) => item.status === "pending").length,
      vouchersIssued: redemptions.length,
      creditsRedeemed: redemptions.reduce((sum, item) => sum + item.cost, 0),
    },
  };
}

export async function decideLeave(id: string, decision: "approved" | "rejected", actorId: string) {
  const result = await inTransaction((db) =>
    db.prepare("UPDATE leave_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'").run(decision, stamp(), actorId, id),
  );
  if (Number(result.changes) === 1) return { ok: true } as const;
  const exists = await (await getDb()).prepare("SELECT status FROM leave_requests WHERE id = ?").get(id);
  return { ok: false, error: exists ? "already_decided" : "not_found" } as const;
}
