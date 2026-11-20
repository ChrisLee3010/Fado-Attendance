// The morning rush: a whole company opens the app and clocks in within a minute.
//
//   npm run test:server        (in another terminal; it starts the server on port 3100 with the test settings)
//   PEOPLE=300 npm run test:rush
//
// What it simulates, per person: sign in, open the Today page (which asks for the wallet and the month every 2 seconds
// for as long as it stays open, exactly like the real page), tap Clock in a moment later, and keep the page open.
// Plus HR watching the attendance board and the admin page. Every person is a separate employee with a month of
// history, created through the test-only /api/test/employees route.
//
// Settings (environment variables):
//   PEOPLE         how many employees                         default 300
//   LOGIN_SECONDS  window in which everyone signs in (0 = all at the same instant, the worst case)   default 30
//   RUSH_SECONDS   window in which everyone opens the app and clocks in                            default 60
//   POLL_SECONDS   how long each person keeps the page open after the rush window                  default 20
//   BASE_URL       default http://localhost:3100
import { DEMO_PASSWORD } from "../src/lib/demo-accounts.ts";
import { EMPLOYEE_POLL_MS, HR_POLL_MS } from "../src/lib/polling.ts";

// How often each open page asks for fresh data: the app's own settings, so this test always matches the real thing.
// POLL_MS=2000 reproduces how the app behaved before it was changed (and fell over at 600 people).
const POLL_MS = Number(process.env.POLL_MS ?? EMPLOYEE_POLL_MS);

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PEOPLE = Number(process.env.PEOPLE ?? 300);
const LOGIN_SECONDS = Number(process.env.LOGIN_SECONDS ?? 30);
const RUSH_SECONDS = Number(process.env.RUSH_SECONDS ?? 60);
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 20);
const TEST_DAY = "2026-11-18";
const OFFICE_RANGE = "203.0.113.0/24"; // documentation-only addresses, never a real network

// What "fast and smooth" means here. Tight enough that a person would notice if it were missed.
const LIMITS = { "POST /api/clock-in": 1000, "GET /api/wallet": 1000, "GET /api/progress": 1000 };

const samples = new Map();
const failures = new Map();

function record(label, ms, status, allowed, reason = "") {
  if (!samples.has(label)) samples.set(label, []);
  samples.get(label).push(ms);
  if (!allowed.includes(status)) {
    const key = `${label} → ${status || `no response${reason ? ` (${reason})` : ""}`}`;
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
}

async function call(client, label, method, path, body, allowed = [200]) {
  const t0 = performance.now();
  try {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(client.cookie ? { Cookie: client.cookie } : {}),
        ...(client.ip ? { "CF-Connecting-IP": client.ip } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("wq_session="));
    if (setCookie) client.cookie = setCookie.split(";")[0];
    const data = await response.json().catch(() => ({}));
    record(label, performance.now() - t0, response.status, allowed);
    return { status: response.status, data };
  } catch (error) {
    record(label, performance.now() - t0, 0, allowed, error?.cause?.code ?? error?.name ?? "unknown");
    return { status: 0, data: {} };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (low, high) => low + Math.random() * (high - low);

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// ---- Setup (not measured) ----
const admin = { cookie: "", ip: "203.0.113.5" };
const must = async (label, response, ok = 200) => {
  if (response.status !== ok) throw new Error(`${label} failed (${response.status}): is \`npm run test:server\` running on ${BASE}?`);
  return response;
};
await must("admin login", await call(admin, "setup", "POST", "/api/auth/login", { email: "admin@fado.demo", password: DEMO_PASSWORD }));
await must("test clock", await call(admin, "setup", "POST", "/api/test/clock", { now: `${TEST_DAY}T08:54` }));
await must("reset", await call(admin, "setup", "POST", "/api/reset"));
await must("create employees", await call(admin, "setup", "POST", "/api/test/employees", { count: PEOPLE }));
await call(admin, "setup", "POST", "/api/admin/networks", { label: "Test office (load)", cidr: OFFICE_RANGE }, [200, 409]);
samples.clear();
failures.clear();

const people = Array.from({ length: PEOPLE }, (_, index) => ({
  email: `load${String(index + 1).padStart(4, "0")}@fado.demo`,
  cookie: "",
  ip: `203.0.113.${(index % 250) + 1}`,
  clockedIn: false,
}));

console.log(`${PEOPLE} employees · sign-in window ${LOGIN_SECONDS}s · rush window ${RUSH_SECONDS}s · page kept open ${POLL_SECONDS}s more · page refreshes every ${POLL_MS / 1000}s · ${BASE}`);

// ---- Phase 1: everyone signs in ----
const loginStart = performance.now();
await Promise.all(
  people.map(async (person) => {
    await sleep(LOGIN_SECONDS > 0 ? between(0, LOGIN_SECONDS * 1000) : 0);
    await call(person, "POST /api/auth/login", "POST", "/api/auth/login", { email: person.email, password: DEMO_PASSWORD });
  }),
);
console.log(`sign-in: all ${PEOPLE} signed in after ${((performance.now() - loginStart) / 1000).toFixed(1)}s`);

// ---- Phase 2: the rush ----
await call(admin, "setup", "POST", "/api/test/clock", { now: `${TEST_DAY}T08:56` });
samples.delete("setup");
const rushEnd = Date.now() + RUSH_SECONDS * 1000;
const deadline = rushEnd + POLL_SECONDS * 1000;
const rushStart = performance.now();

async function person(p) {
  await sleep(between(0, RUSH_SECONDS * 1000)); // opens the app at a random moment in the rush
  const clockInAt = Date.now() + between(1000, 3000); // and taps Clock in a moment later
  let nextPoll = 0;
  while (Date.now() < deadline) {
    // Opening the page loads the wallet and the month; after that the page asks again every POLL_MS.
    if (Date.now() >= nextPoll) {
      await Promise.all([call(p, "GET /api/wallet", "GET", "/api/wallet"), call(p, "GET /api/progress", "GET", "/api/progress")]);
      nextPoll = Date.now() + POLL_MS * between(0.9, 1.1);
    }
    if (!p.clockedIn && Date.now() >= clockInAt) {
      const result = await call(p, "POST /api/clock-in", "POST", "/api/clock-in", {});
      p.clockedIn = result.status === 200;
      // Tapping a button refreshes the page's data straight away, like the real app does.
      await Promise.all([call(p, "GET /api/wallet", "GET", "/api/wallet"), call(p, "GET /api/progress", "GET", "/api/progress")]);
      nextPoll = Date.now() + POLL_MS * between(0.9, 1.1);
    }
    await sleep(250);
  }
}

async function hr() {
  let tick = 0;
  while (Date.now() < deadline) {
    await call(admin, "GET /api/admin/attendance/today", "GET", "/api/admin/attendance/today");
    if (tick % 2 === 0) {
      await call(admin, "GET /api/admin/attendance (log)", "GET", "/api/admin/attendance");
      await call(admin, "GET /api/admin/overview", "GET", "/api/admin/overview");
    }
    tick++;
    await sleep(HR_POLL_MS);
  }
}

await Promise.all([hr(), ...people.map(person)]);
const wall = (performance.now() - rushStart) / 1000;

// ---- Check what was recorded ----
const board = (await call(admin, "check", "GET", "/api/admin/attendance/today")).data;
samples.delete("check");
const recorded = board.rows ? board.rows.filter((row) => row.id.startsWith("LT") && row.clockIn !== null).length : -1;
const tapped = people.filter((p) => p.clockedIn).length;

// ---- Report ----
const rows = [...samples]
  .filter(([label]) => label !== "setup")
  .sort(([a], [b]) => a.localeCompare(b));
console.log("\n" + "endpoint".padEnd(36) + "count".padStart(8) + "p50".padStart(8) + "p95".padStart(8) + "p99".padStart(8) + "max".padStart(8) + "  (ms)");
let total = 0;
for (const [label, values] of rows) {
  const sorted = [...values].sort((a, b) => a - b);
  total += sorted.length;
  console.log(
    label.padEnd(36) +
      String(sorted.length).padStart(8) +
      percentile(sorted, 50).toFixed(0).padStart(8) +
      percentile(sorted, 95).toFixed(0).padStart(8) +
      percentile(sorted, 99).toFixed(0).padStart(8) +
      sorted[sorted.length - 1].toFixed(0).padStart(8),
  );
}
console.log(`\n${total} requests in ${wall.toFixed(0)}s (${(total / wall).toFixed(0)} per second on average)`);
console.log(`clock-ins: ${tapped} of ${PEOPLE} accepted · ${recorded} of ${PEOPLE} found in HR's attendance board`);

const problems = [];
if (failures.size > 0) for (const [what, count] of failures) problems.push(`${count} × ${what}`);
if (tapped !== PEOPLE) problems.push(`only ${tapped} of ${PEOPLE} clock-ins were accepted`);
if (recorded !== PEOPLE) problems.push(`HR's board shows ${recorded} of ${PEOPLE} people clocked in`);
for (const [label, limit] of Object.entries(LIMITS)) {
  const values = [...(samples.get(label) ?? [])].sort((a, b) => a - b);
  if (values.length > 0 && percentile(values, 95) > limit) problems.push(`${label} p95 ${percentile(values, 95).toFixed(0)} ms is over the ${limit} ms limit`);
}

// Leave the server on real time.
await call(admin, "setup", "POST", "/api/test/clock", { now: null });

if (problems.length === 0) {
  console.log(`\nPASS: ${PEOPLE} people, no errors, every clock-in recorded, p95 within the limits.`);
} else {
  console.log("\nNOT GOOD ENOUGH:");
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}
