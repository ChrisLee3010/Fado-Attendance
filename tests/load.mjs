// Simulates many people using the app at once: a login burst, then realistic polling plus a few actions.
// Usage: BASE_URL=http://localhost:3001 USERS=40 SECONDS=20 node tests/load.mjs
import { DEMO_PASSWORD } from "../src/lib/demo-accounts.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const USERS = Number(process.env.USERS ?? 40);
const SECONDS = Number(process.env.SECONDS ?? 20);

const samples = new Map();
let unexpected = 0;

function record(label, ms, status, allowed) {
  if (!samples.has(label)) samples.set(label, []);
  samples.get(label).push(ms);
  if (!allowed.includes(status)) {
    unexpected++;
    if (unexpected <= 5) console.log(`unexpected ${status} on ${label}`);
  }
}

async function call(client, label, method, path, body, allowed = [200]) {
  const started = performance.now();
  try {
    const response = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(client.cookie ? { Cookie: client.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("wq_session="));
    if (setCookie) client.cookie = setCookie.split(";")[0];
    await response.arrayBuffer();
    record(label, performance.now() - started, response.status, allowed);
    return response.status;
  } catch {
    record(label, performance.now() - started, 0, allowed);
    return 0;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUsers() {
  return Array.from({ length: USERS }, (_, index) => {
    const share = index / USERS;
    if (share < 0.7) return { role: "employee", email: index % 2 ? "sarah@fado.demo" : "alex@fado.demo", cookie: "" };
    if (share < 0.85) return { role: "cashier", email: "cashier@fado.demo", cookie: "" };
    return { role: "admin", email: "admin@fado.demo", cookie: "" };
  });
}

async function session(user, deadline) {
  const jitter = Math.random() * 1000;
  await sleep(jitter);
  let tick = 0;
  while (Date.now() < deadline) {
    if (user.role === "employee") {
      await call(user, "GET /api/wallet", "GET", "/api/wallet");
      if (tick === 1) await call(user, "POST /api/clock-out", "POST", "/api/clock-out", { time: "18:05" }, [200, 409]);
      if (tick === 2) await call(user, "POST /api/redeem", "POST", "/api/redeem", { rewardId: "coffee" }, [200, 409]);
    } else if (user.role === "cashier") {
      await call(user, "GET /api/vouchers/:code", "GET", "/api/vouchers/WQ-0000");
      await call(user, "GET /api/auth/me", "GET", "/api/auth/me");
    } else {
      await call(user, "GET /api/admin/overview", "GET", "/api/admin/overview");
      if (tick === 1) await call(user, "POST /api/admin/leave/:id", "POST", "/api/admin/leave/lr-1", { decision: "approved" }, [200, 409]);
    }
    tick++;
    await sleep(2000 + Math.random() * 400);
  }
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const admin = { cookie: "" };
await call(admin, "setup login", "POST", "/api/auth/login", { email: "admin@fado.demo", password: DEMO_PASSWORD });
await call(admin, "setup reset", "POST", "/api/reset");
samples.delete("setup login");
samples.delete("setup reset");

const users = buildUsers();
console.log(`${USERS} users (${users.filter((u) => u.role === "employee").length} employees, ${users.filter((u) => u.role === "cashier").length} cashiers, ${users.filter((u) => u.role === "admin").length} admins) against ${BASE}`);

const loginStarted = performance.now();
await Promise.all(users.map((user) => call(user, "POST /api/auth/login", "POST", "/api/auth/login", { email: user.email, password: DEMO_PASSWORD })));
console.log(`login burst: all ${USERS} signed in after ${Math.round(performance.now() - loginStarted)} ms`);

const deadline = Date.now() + SECONDS * 1000;
await Promise.all(users.map((user) => session(user, deadline)));

console.log("\nendpoint".padEnd(28) + "count".padStart(7) + "p50".padStart(8) + "p95".padStart(8) + "max".padStart(8) + "  (ms)");
for (const [label, values] of [...samples].sort()) {
  const sorted = [...values].sort((a, b) => a - b);
  console.log(
    label.padEnd(28) + String(sorted.length).padStart(7) + percentile(sorted, 50).toFixed(0).padStart(8) + percentile(sorted, 95).toFixed(0).padStart(8) + sorted[sorted.length - 1].toFixed(0).padStart(8),
  );
}
console.log(`\nserver errors / failed requests: ${unexpected}`);
process.exitCode = unexpected === 0 ? 0 : 1;
