import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { json } from "./http";
import type { Role } from "../demo-accounts";
import { DUMMY_HASH, verifyPassword } from "./password";

export const SESSION_COOKIE = "wq_session";
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export type { Role };
export type SessionUser = { id: string; email: string; name: string; roles: Role[]; employeeId: string | null };

export const roleHome = (roles: Role[]) => (roles.includes("employee") ? "/" : roles.includes("admin") ? "/admin" : "/cashier");

function loadRoles(userId: string) {
  return getDb()
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
    .all(userId)
    .map((row) => String(row.role) as Role);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const globalForAuth = globalThis as unknown as { __loginFailures?: Map<string, { count: number; since: number }> };
const failures = (globalForAuth.__loginFailures ??= new Map());

function isLockedOut(email: string) {
  const entry = failures.get(email);
  if (!entry) return false;
  if (Date.now() - entry.since > LOCKOUT_MS) {
    failures.delete(email);
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
}

function recordFailure(email: string) {
  const entry = failures.get(email);
  if (!entry || Date.now() - entry.since > LOCKOUT_MS) failures.set(email, { count: 1, since: Date.now() });
  else entry.count += 1;
}

export type LoginResult =
  | { ok: true; user: SessionUser; token: string }
  | { ok: false; error: "invalid_credentials" | "too_many_attempts" };

const globalForQueues = globalThis as unknown as { __loginQueues?: Map<string, Promise<void>> };
const loginQueues = (globalForQueues.__loginQueues ??= new Map());

// Attempts for one email run one at a time, so a burst of guesses can't all slip past the lockout check.
function serializedPerEmail<T>(email: string, work: () => Promise<T>): Promise<T> {
  const run = (loginQueues.get(email) ?? Promise.resolve()).then(work, work);
  const tail = run.then(() => undefined, () => undefined);
  loginQueues.set(email, tail);
  void tail.then(() => {
    if (loginQueues.get(email) === tail) loginQueues.delete(email);
  });
  return run;
}

export function login(rawEmail: string, password: string): Promise<LoginResult> {
  const email = rawEmail.trim().toLowerCase();
  return serializedPerEmail(email, () => attemptLogin(email, password));
}

async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  if (isLockedOut(email)) return { ok: false, error: "too_many_attempts" };

  const db = getDb();
  const row = db.prepare("SELECT id, email, name, employee_id, password_hash FROM users WHERE email = ?").get(email);
  const passwordOk = await verifyPassword(password, row ? String(row.password_hash) : DUMMY_HASH);
  if (!row || !passwordOk) {
    recordFailure(email);
    return { ok: false, error: "invalid_credentials" };
  }

  failures.delete(email);
  const token = randomBytes(32).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hashToken(token), String(row.id), now + SESSION_SECONDS);

  return {
    ok: true,
    token,
    user: { id: String(row.id), email: String(row.email), name: String(row.name), roles: loadRoles(String(row.id)), employeeId: row.employee_id ? String(row.employee_id) : null },
  };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    secure: process.env.COOKIE_SECURE === "1",
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  store.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.employee_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), Math.floor(Date.now() / 1000));
  if (!row) return null;
  return { id: String(row.id), email: String(row.email), name: String(row.name), roles: loadRoles(String(row.id)), employeeId: row.employee_id ? String(row.employee_id) : null };
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export type Authorization = { ok: true; user: SessionUser } | { ok: false; response: Response };

export async function authorize(request: Request, ...roles: Role[]): Promise<Authorization> {
  if (request.method !== "GET" && !isSameOrigin(request)) {
    return { ok: false, response: json({ error: "bad_origin" }, 403) };
  }
  const user = await currentUser();
  if (!user) return { ok: false, response: json({ error: "unauthenticated" }, 401) };
  if (roles.length > 0 && !roles.some((role) => user.roles.includes(role))) {
    return { ok: false, response: json({ error: "forbidden", home: roleHome(user.roles) }, 403) };
  }
  return { ok: true, user };
}
