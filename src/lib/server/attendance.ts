import { formatIp, formatRange, parseRange, rangeContains, rangeForCurrentNetwork, type ParsedIp } from "../ip";
import type { ClientIp } from "./client-ip";
import { stamp } from "./clock";
import { getDb, inTransaction, type Db } from "./db";

export type PunchKind = "clock_in" | "clock_out";

// Why a punch was accepted or refused. Shown in the admin log, so keep them readable.
export type AttemptReason =
  | "ok_office"
  | "ok_remote"
  | "not_office_network"
  | "no_client_ip"
  | "already_clocked_in"
  | "already_clocked_out"
  | "no_clock_in";

export type Where =
  | { verdict: "office"; network: string }
  | { verdict: "remote" }
  | { verdict: "blocked"; reason: "not_office_network" | "no_client_ip" };

async function matchingNetwork(db: Db, ip: ParsedIp) {
  for (const row of await db.prepare("SELECT cidr, label FROM office_networks ORDER BY id").all()) {
    const range = parseRange(String(row.cidr));
    if (range && rangeContains(range, ip)) return String(row.label);
  }
  return null;
}

// Office network first; otherwise remote if this person may work remotely; otherwise refused.
export async function locate(db: Db, employeeId: string, client: ClientIp): Promise<Where> {
  const network = client.ip ? await matchingNetwork(db, client.ip) : null;
  if (network) return { verdict: "office", network };
  const employee = await db.prepare("SELECT remote_allowed FROM employees WHERE id = ?").get(employeeId);
  if (Number(employee?.remote_allowed) === 1) return { verdict: "remote" };
  return { verdict: "blocked", reason: client.ip ? "not_office_network" : "no_client_ip" };
}

export async function recordAttempt(db: Db, args: { employeeId: string; kind: PunchKind; client: ClientIp; userAgent: string | null; accepted: boolean; reason: AttemptReason }) {
  await db.prepare("INSERT INTO clock_attempts (employee_id, kind, at, ip, user_agent, accepted, reason) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(args.employeeId, args.kind, stamp(), args.client.ip ? formatIp(args.client.ip) : null, args.userAgent, args.accepted ? 1 : 0, args.reason);
}

// What the Today page shows before you tap: are you on the office network right now?
export async function whereAmI(employeeId: string, client: ClientIp) {
  const where = await locate(await getDb(), employeeId, client);
  return {
    ip: client.ip ? formatIp(client.ip) : null,
    verdict: where.verdict,
    network: where.verdict === "office" ? where.network : null,
  };
}

export async function listNetworks() {
  const rows = await (await getDb())
    .prepare("SELECT n.id, n.cidr, n.label, n.added_at, COALESCE(u.name, n.added_by) AS added_by FROM office_networks n LEFT JOIN users u ON u.id = n.added_by ORDER BY n.id")
    .all();
  return rows.map((row) => ({ id: Number(row.id), cidr: String(row.cidr), label: String(row.label), addedAt: String(row.added_at), addedBy: String(row.added_by) }));
}

export type AddNetworkResult = { ok: true; cidr: string } | { ok: false; error: "invalid_range" | "invalid_label" | "duplicate" | "no_client_ip" };

// `useCurrent` adds the network the admin is on right now, read from their own request, never from the body.
export async function addNetwork(args: { cidr?: string; useCurrent?: boolean; label: string; client: ClientIp; actorId: string }): Promise<AddNetworkResult> {
  const label = args.label.trim();
  if (label.length === 0 || label.length > 60) return { ok: false, error: "invalid_label" };

  let cidr: string;
  if (args.useCurrent) {
    if (!args.client.ip) return { ok: false, error: "no_client_ip" };
    cidr = formatRange(rangeForCurrentNetwork(args.client.ip));
  } else {
    const range = args.cidr ? parseRange(args.cidr) : null;
    if (!range) return { ok: false, error: "invalid_range" };
    cidr = formatRange(range);
  }

  return inTransaction(async (db) => {
    if (await db.prepare("SELECT 1 AS found FROM office_networks WHERE cidr = ?").get(cidr)) return { ok: false, error: "duplicate" } as const;
    await db.prepare("INSERT INTO office_networks (cidr, label, added_at, added_by) VALUES (?, ?, ?, ?)").run(cidr, label, stamp(), args.actorId);
    return { ok: true, cidr } as const;
  });
}

export async function removeNetwork(id: number) {
  const result = await inTransaction((db) => db.prepare("DELETE FROM office_networks WHERE id = ?").run(id));
  return Number(result.changes) === 1;
}

export async function recentAttempts(limit = 50) {
  const rows = await (await getDb())
    .prepare(
      `SELECT a.id, a.kind, a.at, a.ip, a.user_agent, a.accepted, a.reason, e.name, e.id AS employee_id
       FROM clock_attempts a JOIN employees e ON e.id = a.employee_id ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit);
  return rows.map((row) => ({
      id: Number(row.id),
      kind: String(row.kind) as PunchKind,
      at: String(row.at),
      ip: row.ip === null ? null : String(row.ip),
      userAgent: row.user_agent === null ? null : String(row.user_agent),
      accepted: Number(row.accepted) === 1,
      reason: String(row.reason) as AttemptReason,
      name: String(row.name),
      employeeId: String(row.employee_id),
    }));
}
