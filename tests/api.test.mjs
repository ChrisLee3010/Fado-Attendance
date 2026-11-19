import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts.ts";

// Run `npm run test:server` first (it starts a server on port 3100 with the test clock on and TRUSTED_PROXY=cloudflare,
// so each test client can say which network it is on, the way Cloudflare's CF-Connecting-IP header would).
// Every test runs on Wednesday 11 November 2026; the fictional history fills the working days before it.
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const TEST_DAY = "2026-11-11";

// Documentation-only address ranges (RFC 5737 / RFC 3849), never real networks.
const OFFICE_RANGE = "203.0.113.0/24";
const OFFICE_IP = "203.0.113.10";
const HOME_IP = "198.51.100.7";

class Client {
  cookie = "";

  // Which network this "phone" is on. null sends no CF-Connecting-IP at all.
  constructor(ip = OFFICE_IP) {
    this.ip = ip;
  }

  async call(method, path, body, headers = {}) {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.ip ? { "CF-Connecting-IP": this.ip } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("wq_session="));
    if (setCookie) {
      const pair = setCookie.split(";")[0];
      this.cookie = pair === "wq_session=" ? "" : pair;
    }
    return { status: response.status, data: await response.json(), setCookie };
  }

  async login(email, password = DEMO_PASSWORD) {
    const result = await this.call("POST", "/api/auth/login", { email, password });
    assert.equal(result.status, 200, `login as ${email}`);
    return result;
  }

  wallet = async () => (await this.call("GET", "/api/wallet")).data;
  // The server decides the time, so "clock in at 08:55" means: move the server clock to 08:55, then clock in.
  clockIn = async (time) => {
    if (time) await setClock(time);
    return this.call("POST", "/api/clock-in", {});
  };
  clockOut = async (time) => {
    if (time) await setClock(time);
    return this.call("POST", "/api/clock-out", {});
  };
  redeem = () => this.call("POST", "/api/redeem", { rewardId: "coffee" });

  // The same signed-in person on another network, e.g. Alex at home.
  on(ip) {
    const twin = new Client(ip);
    twin.cookie = this.cookie;
    return twin;
  }
}

let admin, alex, sarah, cashier;

async function setClock(time) {
  const result = await admin.call("POST", "/api/test/clock", { now: time === null ? null : `${TEST_DAY}T${time}` });
  assert.equal(result.status, 200, `the server at ${BASE} isn't a test server: start one with \`npm run test:server\``);
}

async function resetAt(time = "12:00") {
  await setClock(time);
  await admin.call("POST", "/api/reset");
}

// A normal morning: everyone clocks in from the office through the app.
async function freshDay() {
  await resetAt();
  for (const [client, time] of [[alex, "08:55"], [sarah, "09:03"], [admin, "08:58"]]) {
    assert.equal((await client.clockIn(time)).status, 200, `clock-in at ${time}`);
  }
  await setClock("12:00");
}

const officeNetworkIds = async () =>
  (await admin.call("GET", "/api/admin/attendance")).data.networks.filter((network) => network.label.startsWith("Test ")).map((network) => network.id);

before(async () => {
  await fetch(BASE).catch(() => {
    throw new Error(`Nothing is running at ${BASE}. Start the test server in another terminal first: npm run test:server`);
  });
  [admin, alex, sarah, cashier] = [new Client(), new Client(), new Client(), new Client()];
  await admin.login("admin@fado.demo");
  await alex.login("alex@fado.demo");
  await sarah.login("sarah@fado.demo");
  await cashier.login("cashier@fado.demo");
  const attendance = (await admin.call("GET", "/api/admin/attendance")).data;
  assert.equal(attendance.ipMode, "cloudflare", "start the server with TRUSTED_PROXY=cloudflare to run the API tests");
  for (const id of await officeNetworkIds()) await admin.call("DELETE", `/api/admin/networks/${id}`);
  assert.equal((await admin.call("POST", "/api/admin/networks", { label: "Test office", cidr: OFFICE_RANGE })).status, 200);
});

beforeEach(() => freshDay());

// Leave the server on real time with fresh demo data and no test networks.
after(async () => {
  for (const id of await officeNetworkIds()) await admin.call("DELETE", `/api/admin/networks/${id}`);
  await setClock(null);
  await admin.call("POST", "/api/reset");
});

test("requests without a session are rejected", async () => {
  const anonymous = new Client();
  for (const [method, path] of [["GET", "/api/auth/me"], ["GET", "/api/wallet"], ["GET", "/api/admin/overview"], ["GET", "/api/vouchers/WQ-0000"], ["POST", "/api/redeem"], ["POST", "/api/reset"]]) {
    assert.equal((await anonymous.call(method, path, method === "POST" ? {} : undefined)).status, 401, `${method} ${path}`);
  }
});

test("login: wrong password and unknown email fail the same way and set no cookie", async () => {
  const client = new Client();
  const wrongPassword = await client.call("POST", "/api/auth/login", { email: "alex@fado.demo", password: "nope" });
  const unknownEmail = await client.call("POST", "/api/auth/login", { email: "nobody@fado.demo", password: "nope" });
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword.data, unknownEmail.data);
  assert.equal(wrongPassword.setCookie, undefined);
  assert.equal((await client.call("POST", "/api/auth/login", { email: "alex@fado.demo" })).status, 400);
});

test("the session cookie is httpOnly and SameSite=Lax", async () => {
  const { setCookie } = await new Client().login("sarah@fado.demo");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
});

test("each account reports its roles and lands on the right home", async () => {
  assert.deepEqual((await alex.call("GET", "/api/auth/me")).data, { name: "Alex Morgan", roles: ["employee"], firstName: "Alex", home: "/" });
  assert.deepEqual((await admin.call("GET", "/api/auth/me")).data, { name: "Daniel Lee", roles: ["admin", "employee"], firstName: "Daniel", home: "/" });
  assert.deepEqual((await cashier.call("GET", "/api/auth/me")).data, { name: "Café Cashier", roles: ["cashier"], firstName: "Café", home: "/cashier" });
});

test("each employee's wallet reports their own real clock-in and arrival", async () => {
  const [a, s, d] = [await alex.wallet(), await sarah.wallet(), await admin.wallet()];
  assert.deepEqual([a.clockIn, a.arrival], ["08:55", "on_time"]);
  assert.deepEqual([s.clockIn, s.arrival], ["09:03", "late"]);
  assert.deepEqual([d.clockIn, d.arrival], ["08:58", "on_time"]);
  assert.deepEqual(a.window, { clockIn: "08:50–09:00", clockOut: "18:00–18:10" });

  await alex.clockOut("18:05");
  await sarah.clockOut("18:05");
  const [after, sarahAfter] = [await alex.wallet(), await sarah.wallet()];
  assert.deepEqual([after.clockOut, after.perfectDay], ["18:05", true]);
  assert.deepEqual([sarahAfter.clockOut, sarahAfter.perfectDay], ["18:05", false]);
});

test("every history entry has a real date, time, category and status, newest first", async () => {
  const state = await alex.wallet();
  assert.equal(state.today, "2026-11-11");
  assert.equal(state.ledger.length, 11);
  for (const entry of state.ledger) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(entry.time, /^\d{2}:\d{2}$/);
    assert.ok(["attendance", "achievement", "redemption", "adjustment"].includes(entry.category), entry.category);
    assert.ok(["credited", "issued", "used"].includes(entry.status), entry.status);
  }
  const stamps = state.ledger.map((entry) => `${entry.date} ${entry.time}`);
  assert.deepEqual(stamps, [...stamps].sort().reverse(), "newest first");
  assert.equal(state.ledger.find((entry) => entry.title === "Attendance correction").category, "adjustment");
  assert.equal(state.ledger.reduce((sum, entry) => sum + entry.amount, 0), state.balance, "balance is the sum of the history");
});

test("new credits and redemptions land at the top of the history and track the voucher status", async () => {
  await alex.clockOut("18:05");
  let top = (await alex.wallet()).ledger[0];
  assert.deepEqual([top.date, top.time, top.category, top.amount, top.status], ["2026-11-11", "18:05", "attendance", 2, "credited"]);

  const { code } = (await alex.redeem()).data;
  top = (await alex.wallet()).ledger[0];
  assert.deepEqual([top.category, top.amount, top.status], ["redemption", -40, "issued"]);

  await cashier.call("POST", `/api/vouchers/${code}/consume`);
  assert.equal((await alex.wallet()).ledger[0].status, "used");
});

test("a seeded redemption shows its voucher status in the history", async () => {
  const lunch = (await sarah.wallet()).ledger.find((entry) => entry.category === "redemption");
  assert.deepEqual([lunch.title, lunch.amount, lunch.status], ["Lunch for two voucher", -75, "used"]);
});

test("an admin is also an employee with their own workday and wallet", async () => {
  const before = await admin.wallet();
  assert.equal(before.balance, 38);
  assert.equal(before.clockedOut, false);

  const result = await admin.clockOut("18:05");
  assert.equal(result.data.qualifies, true, "clocked in at 08:58, inside the window");
  assert.equal((await admin.wallet()).balance, 48, "+2 Perfect Day and +8 for the 8 Perfect Days milestone");
  assert.equal((await alex.wallet()).clockedOut, false, "Alex's workday is untouched");
  assert.equal((await alex.wallet()).balance, 38);
});

test("progress: each employee sees their own month, built from their real punches", async () => {
  const alexProgress = (await alex.call("GET", "/api/progress")).data;
  assert.equal(alexProgress.month, "2026-11");
  assert.equal(alexProgress.days.length, 30);
  assert.deepEqual(alexProgress.stats, {
    perfectDays: 6, scheduledShifts: 21, scheduledToDate: 8, attended: 8, arrivedByStart: 7, milestonesReached: 1,
  });
  const kinds = Object.fromEntries(alexProgress.days.map((day) => [day.date, day.kind]));
  assert.deepEqual([kinds["2026-11-02"], kinds["2026-11-06"], kinds["2026-11-07"], kinds["2026-11-11"], kinds["2026-11-12"]], ["perfect", "attended", "weekend", "in_progress", "upcoming"]);
  assert.deepEqual(alexProgress.milestones.next, { target: 8, remaining: 2, credits: 8 });
  assert.deepEqual(alexProgress.reward, { name: "Coffee voucher", icon: "☕", cost: 40, balance: 38, remaining: 2 });

  const sarahProgress = (await sarah.call("GET", "/api/progress")).data;
  assert.deepEqual(sarahProgress.stats, {
    perfectDays: 4, scheduledShifts: 20, scheduledToDate: 7, attended: 6, arrivedByStart: 5, milestonesReached: 0,
  });
  const sarahKinds = Object.fromEntries(sarahProgress.days.map((day) => [day.date, day.kind]));
  assert.deepEqual([sarahKinds["2026-11-03"], sarahKinds["2026-11-05"], sarahKinds["2026-11-06"]], ["no_record", "attended", "leave"]);
  assert.equal(sarahProgress.days.find((day) => day.date === "2026-11-05").reason, "early_departure");
  assert.deepEqual(sarahProgress.milestones.next, { target: 5, remaining: 1, credits: 5 });
});

test("progress contains only your own data and no rankings or scores", async () => {
  const text = JSON.stringify((await alex.call("GET", "/api/progress")).data);
  for (const forbidden of ["Sarah", "Daniel", "Minh", "EMP002", "EMP003", "EMP006"]) assert.ok(!text.includes(forbidden), forbidden);
  assert.doesNotMatch(text, /rank|score|leaderboard|percentile/i);
});

test("progress needs an employee record: the cashier and signed-out users are refused", async () => {
  assert.equal((await cashier.call("GET", "/api/progress")).status, 403);
  assert.equal((await new Client().call("GET", "/api/progress")).status, 401);
  assert.equal((await admin.call("GET", "/api/progress")).status, 200, "an admin is also an employee");
});

test("reaching a milestone at clock-out credits it exactly once", async () => {
  const before = (await admin.call("GET", "/api/progress")).data;
  assert.deepEqual([before.stats.perfectDays, before.stats.milestonesReached, before.milestones.next.target], [7, 1, 8]);

  await admin.clockOut("18:05");
  const after = (await admin.call("GET", "/api/progress")).data;
  assert.deepEqual([after.stats.perfectDays, after.stats.milestonesReached, after.milestones.next.target], [8, 2, 12]);

  await admin.clockOut("18:05");
  const ledger = (await admin.wallet()).ledger;
  assert.equal(ledger.filter((entry) => entry.title === "8 Perfect Days milestone").length, 1);
  assert.equal(ledger.find((entry) => entry.title === "8 Perfect Days milestone").amount, 8);
  assert.equal((await admin.wallet()).balance, 48, "a repeated clock-out adds nothing");
});

test("a Perfect Day that doesn't reach a milestone adds only its own credit", async () => {
  await alex.clockOut("18:05");
  const progress = (await alex.call("GET", "/api/progress")).data;
  assert.deepEqual([progress.stats.perfectDays, progress.stats.milestonesReached, progress.milestones.next.remaining], [7, 1, 1]);
  assert.equal((await alex.wallet()).balance, 40);
});

test("a day without a Perfect Day earns no milestone progress", async () => {
  await sarah.clockOut("18:05");
  const progress = (await sarah.call("GET", "/api/progress")).data;
  assert.equal(progress.stats.perfectDays, 4);
  assert.equal(progress.days.find((day) => day.date === "2026-11-11").kind, "attended");
});

test("an admin's own redemption appears in the admin overview and is fulfilled by the cashier", async () => {
  await admin.clockOut("18:05");
  const { status, data } = await admin.redeem();
  assert.equal(status, 200);

  const mine = (await admin.call("GET", "/api/admin/overview")).data.redemptions.find((item) => item.code === data.code);
  assert.equal(mine.name, "Daniel Lee");
  assert.equal(mine.status, "issued");

  assert.equal((await cashier.call("POST", `/api/vouchers/${data.code}/consume`)).status, 200);
  assert.notEqual((await admin.wallet()).voucherUsedAt, null);
  assert.equal((await admin.call("GET", "/api/admin/overview")).data.redemptions.find((item) => item.code === data.code).status, "used");
});

test("roles are enforced: nobody can use another role's endpoints", async () => {
  await alex.clockOut("18:05");
  const { data } = await alex.redeem();

  const wrongRole = [
    [alex, "GET", "/api/admin/overview", "/"],
    [alex, "POST", "/api/reset", "/"],
    [alex, "GET", `/api/vouchers/${data.code}`, "/"],
    [alex, "POST", `/api/vouchers/${data.code}/consume`, "/"],
    [alex, "POST", "/api/admin/leave/lr-1", "/"],
    [cashier, "GET", "/api/wallet", "/cashier"],
    [cashier, "POST", "/api/redeem", "/cashier"],
    [cashier, "GET", "/api/admin/overview", "/cashier"],
    [cashier, "POST", "/api/clock-out", "/cashier"],
    [cashier, "POST", "/api/clock-in", "/cashier"],
    [alex, "GET", "/api/admin/attendance", "/"],
    [alex, "POST", "/api/admin/networks", "/"],
    [alex, "DELETE", "/api/admin/networks/1", "/"],
    [alex, "GET", "/api/admin/attendance/today", "/"],
    [alex, "GET", "/api/admin/attendance/month", "/"],
    [alex, "POST", "/api/admin/attendance/corrections", "/"],
    [cashier, "GET", "/api/admin/attendance/today", "/cashier"],
    [cashier, "GET", "/api/honours", "/cashier"],
    [admin, "GET", `/api/vouchers/${data.code}`, "/"],
    [admin, "POST", `/api/vouchers/${data.code}/consume`, "/"],
  ];
  for (const [client, method, path, home] of wrongRole) {
    const result = await client.call(method, path, method === "POST" ? { decision: "approved", rewardId: "coffee" } : undefined);
    assert.equal(result.status, 403, `${method} ${path}`);
    assert.equal(result.data.home, home);
  }
  assert.equal((await alex.wallet()).voucherUsedAt, null, "forbidden consume did not touch the voucher");
});

test("employees only ever see their own wallet", async () => {
  const [a, s] = [await alex.wallet(), await sarah.wallet()];
  assert.equal(a.balance, 38);
  assert.equal(s.balance, 50);
  assert.equal(s.ledger.some((entry) => entry.title.includes("Four-day rhythm")), false);

  await alex.clockOut("18:05");
  await alex.redeem();
  assert.equal((await sarah.wallet()).balance, 50, "Alex's redemption does not touch Sarah");
  assert.equal((await sarah.wallet()).voucher, null);
});

test("Sarah arrived at 09:03, so the Perfect Day bonus is withheld but attendance counts", async () => {
  const result = await sarah.clockOut("18:05");
  assert.equal(result.data.qualifies, false);
  assert.equal(result.data.reason, "late_arrival");
  const state = await sarah.wallet();
  assert.equal(state.clockedOut, true);
  assert.equal(state.balance, 50);
});

test("clock-out inside the Perfect Day window awards 2 credits exactly once", async () => {
  assert.equal((await alex.clockOut("18:05")).data.qualifies, true);
  assert.equal((await alex.wallet()).balance, 40);
  assert.equal((await alex.clockOut("18:05")).data.alreadyClockedOut, true);
  assert.equal((await alex.wallet()).balance, 40);
});

test("clock-out boundaries: 18:00 and 18:10 qualify, 17:59 and 18:11 do not", async () => {
  for (const [time, expected] of [["18:00", true], ["18:10", true], ["17:59", false], ["18:11", false], ["18:30", false]]) {
    await freshDay();
    assert.equal((await alex.clockOut(time)).data.qualifies, expected, `clock-out at ${time}`);
    const state = await alex.wallet();
    assert.equal(state.balance, expected ? 40 : 38, `balance after ${time}`);
    assert.equal(state.clockedOut, true, "attendance is still recorded");
  }
});

test("the browser can't choose its clock-out time: the server's clock decides", async () => {
  await setClock("17:30");
  const result = await alex.call("POST", "/api/clock-out", { time: "18:05" });
  assert.equal(result.status, 200);
  assert.equal(result.data.time, "17:30");
  assert.equal(result.data.qualifies, false);
  assert.equal((await alex.wallet()).clockOut, "17:30");
});

test("the wallet reports the server's current date and time", async () => {
  await setClock("09:41");
  const state = await alex.wallet();
  assert.deepEqual([state.today, state.now], [TEST_DAY, "09:41"]);
});

test("redemptions and voucher use are stamped with the server's time", async () => {
  await alex.clockOut("18:05");
  await setClock("18:20");
  const { code } = (await alex.redeem()).data;
  await setClock("18:31");
  await cashier.call("POST", `/api/vouchers/${code}/consume`);

  const state = await alex.wallet();
  assert.deepEqual([state.voucherIssuedAt, state.voucherUsedAt], ["Today · 18:20", "Today · 18:31"]);
  assert.equal(state.ledger[0].time, "18:20");
  assert.equal((await admin.call("GET", "/api/admin/overview")).data.redemptions.find((item) => item.code === code).when, "Today · 18:20");
});

test("the test clock only accepts a real date and time", async () => {
  assert.equal((await admin.call("POST", "/api/test/clock", { now: "soon" })).status, 400);
  assert.equal((await alex.call("POST", "/api/test/clock", { now: `${TEST_DAY}T09:00` })).status, 403, "only an admin can move it");
});

test("redeeming without enough credits is refused", async () => {
  const result = await alex.redeem();
  assert.equal(result.status, 409);
  assert.equal(result.data.error, "insufficient_credits");
  assert.equal((await alex.wallet()).balance, 38);
});

test("five simultaneous redemptions never overspend: exactly one succeeds", async () => {
  await alex.clockOut("18:05");
  const results = await Promise.all(Array.from({ length: 5 }, () => alex.redeem()));
  const ok = results.filter((r) => r.status === 200);
  assert.equal(ok.length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);

  const state = await alex.wallet();
  assert.equal(state.balance, 0);
  assert.equal(state.voucher, ok[0].data.code);
  const overview = (await admin.call("GET", "/api/admin/overview")).data;
  assert.equal(overview.catalogue.find((item) => item.id === "coffee").stock, 11);
});

test("a voucher can be used once, even when scanned five times at once", async () => {
  await alex.clockOut("18:05");
  const { code } = (await alex.redeem()).data;

  assert.equal((await cashier.call("GET", `/api/vouchers/${code}`)).data.status, "issued");
  const results = await Promise.all(Array.from({ length: 5 }, () => cashier.call("POST", `/api/vouchers/${code}/consume`)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);

  assert.equal((await cashier.call("GET", `/api/vouchers/${code}`)).data.status, "used");
  assert.notEqual((await alex.wallet()).voucherUsedAt, null);
});

test("voucher lookup is case-insensitive and unknown codes are invalid", async () => {
  await alex.clockOut("18:05");
  const { code } = (await alex.redeem()).data;
  assert.equal((await cashier.call("GET", `/api/vouchers/${code.toLowerCase()}`)).data.status, "issued");
  assert.equal((await cashier.call("GET", "/api/vouchers/WQ-0000")).data.status, "invalid");
  assert.equal((await cashier.call("POST", "/api/vouchers/WQ-0000/consume")).status, 404);
});

test("a leave decision is final and cannot be changed", async () => {
  assert.equal((await admin.call("POST", "/api/admin/leave/lr-1", { decision: "approved" })).status, 200);
  assert.equal((await admin.call("POST", "/api/admin/leave/lr-1", { decision: "rejected" })).status, 409);

  const overview = (await admin.call("GET", "/api/admin/overview")).data;
  assert.equal(overview.leave.find((item) => item.id === "lr-1").status, "approved");
  assert.equal(overview.stats.pendingLeave, 1);
  assert.equal((await admin.call("POST", "/api/admin/leave/lr-2", { decision: "maybe" })).status, 400);
  assert.equal((await admin.call("POST", "/api/admin/leave/nope", { decision: "approved" })).status, 404);
});

test("state-changing requests from another origin are refused", async () => {
  await alex.clockOut("18:05");
  const result = await alex.call("POST", "/api/redeem", { rewardId: "coffee" }, { Origin: "http://evil.example" });
  assert.equal(result.status, 403);
  assert.equal(result.data.error, "bad_origin");
  assert.equal((await alex.wallet()).balance, 40, "nothing was spent");
});

test("logging out ends the session on the server, not just in the browser", async () => {
  const client = new Client();
  await client.login("alex@fado.demo");
  const stolenCookie = client.cookie;
  assert.equal((await client.call("GET", "/api/wallet")).status, 200);

  assert.equal((await client.call("POST", "/api/auth/logout")).status, 200);
  const replay = new Client();
  replay.cookie = stolenCookie;
  assert.equal((await replay.call("GET", "/api/wallet")).status, 401, "old cookie no longer works");
});

test("twelve people can sign in to the same demo account at the same moment", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () => new Client().call("POST", "/api/auth/login", { email: "cashier@fado.demo", password: DEMO_PASSWORD })),
  );
  assert.deepEqual(results.map((r) => r.status), Array(12).fill(200));
});

test("twenty simultaneous wrong guesses still get only five attempts", async () => {
  const email = `race-${Date.now()}@fado.demo`;
  const results = await Promise.all(
    Array.from({ length: 20 }, () => new Client().call("POST", "/api/auth/login", { email, password: "wrong" })),
  );
  assert.equal(results.filter((r) => r.status === 401).length, 5);
  assert.equal(results.filter((r) => r.status === 429).length, 15);
});

test("five failed logins lock the email out for a while", async () => {
  const client = new Client();
  const email = `lockout-${Date.now()}@fado.demo`;
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await client.call("POST", "/api/auth/login", { email, password: "wrong" })).status, 401);
  }
  assert.equal((await client.call("POST", "/api/auth/login", { email, password: "wrong" })).status, 429);
});

// ---- Clock-in and the office network check ----

const attendance = async () => (await admin.call("GET", "/api/admin/attendance")).data;

test("clocking in from the office records the server's time and the office as the place", async () => {
  await resetAt();
  const before = await alex.wallet();
  assert.deepEqual([before.clockIn, before.location.verdict, before.location.network], [null, "office", "Test office"]);

  const result = await alex.clockIn("08:54");
  assert.equal(result.status, 200);
  assert.deepEqual([result.data.time, result.data.mode, result.data.arrival, result.data.alreadyClockedIn], ["08:54", "office", "on_time", false]);
  const after = await alex.wallet();
  assert.deepEqual([after.clockIn, after.clockInMode, after.arrival], ["08:54", "office", "on_time"]);
});

test("clocking in from outside the office is refused, logged, and changes nothing", async () => {
  await resetAt();
  const home = alex.on(HOME_IP);
  assert.equal((await home.wallet()).location.verdict, "blocked");

  const result = await home.clockIn("08:55");
  assert.equal(result.status, 403);
  assert.deepEqual(result.data, { ok: false, error: "not_office_network", ip: HOME_IP });
  assert.equal((await alex.wallet()).clockIn, null, "no clock-in was recorded");

  const [latest] = (await attendance()).attempts;
  assert.deepEqual([latest.name, latest.kind, latest.accepted, latest.reason, latest.ip], ["Alex Morgan", "clock_in", false, "not_office_network", HOME_IP]);
});

test("someone allowed to work remotely is recorded as remote instead of refused", async () => {
  await resetAt();
  const home = sarah.on(HOME_IP);
  assert.equal((await home.wallet()).location.verdict, "remote");
  const result = await home.clockIn("08:57");
  assert.deepEqual([result.status, result.data.mode], [200, "remote"]);
  assert.equal((await sarah.wallet()).clockInMode, "remote");
  assert.equal((await attendance()).attempts[0].reason, "ok_remote");
});

test("a faked X-Forwarded-For can't pretend to be the office", async () => {
  await resetAt();
  const noCloudflareHeader = alex.on(null);
  const spoofed = await noCloudflareHeader.call("POST", "/api/clock-in", {}, { "X-Forwarded-For": OFFICE_IP });
  assert.deepEqual([spoofed.status, spoofed.data.error], [403, "no_client_ip"]);

  const fromHome = await alex.on(HOME_IP).call("POST", "/api/clock-in", {}, { "X-Forwarded-For": OFFICE_IP });
  assert.deepEqual([fromHome.status, fromHome.data.error], [403, "not_office_network"], "only CF-Connecting-IP counts");
  assert.equal((await alex.wallet()).clockIn, null);
});

test("clock-out is checked too: leaving early and clocking out from home doesn't work", async () => {
  const result = await alex.on(HOME_IP).clockOut("18:05");
  assert.deepEqual([result.status, result.data.error], [403, "not_office_network"]);
  const state = await alex.wallet();
  assert.deepEqual([state.clockedOut, state.balance], [false, 38], "no clock-out, no Perfect Day credit");
  assert.equal((await alex.clockOut("18:05")).data.qualifies, true, "the same clock-out from the office works");
});

test("a second clock-in keeps the first time", async () => {
  const again = await alex.clockIn("10:30");
  assert.deepEqual([again.status, again.data.alreadyClockedIn, again.data.time], [200, true, "08:55"]);
  assert.equal((await alex.wallet()).clockIn, "08:55");
  assert.equal((await attendance()).attempts[0].reason, "already_clocked_in");
});

test("ten taps at once still record exactly one clock-in", async () => {
  await resetAt("08:56");
  const results = await Promise.all(Array.from({ length: 10 }, () => alex.call("POST", "/api/clock-in", {})));
  assert.deepEqual(results.map((r) => r.status), Array(10).fill(200));
  assert.equal(results.filter((r) => r.data.alreadyClockedIn === false).length, 1);
  assert.equal((await alex.wallet()).clockIn, "08:56");
});

test("clocking out without a clock-in is refused", async () => {
  await resetAt("18:05");
  const result = await alex.clockOut();
  assert.deepEqual([result.status, result.data.error], [409, "no_clock_in"]);
});

test("an IPv6 office network covers every device on its /64", async () => {
  await resetAt();
  const adminOnV6 = admin.on("2001:db8:aa:bb:1111:2222:3333:4444");
  const added = await adminOnV6.call("POST", "/api/admin/networks", { label: "Test office IPv6", current: true });
  assert.deepEqual([added.status, added.data.cidr], [200, "2001:db8:aa:bb::/64"]);

  const result = await alex.on("2001:db8:aa:bb:9999:8888:7777:6666").clockIn("08:59");
  assert.deepEqual([result.status, result.data.mode], [200, "office"]);
  assert.equal((await alex.on("2001:db8:aa:cc::1").call("POST", "/api/clock-out", {})).status, 403, "a different /64 is not the office");
});

test("office networks: validation, duplicates and removal", async () => {
  const add = (body) => admin.call("POST", "/api/admin/networks", body);
  assert.deepEqual([(await add({ label: "Test bad", cidr: "203.0.113.0/33" })).data.error], ["invalid_range"]);
  assert.deepEqual([(await add({ label: "", cidr: "192.0.2.0/24" })).data.error], ["invalid_label"]);
  assert.equal((await add({ label: "Test dup", cidr: "203.0.113.99/24" })).status, 409, "same range once host bits are cleared");

  const { data } = await add({ label: "Test branch", cidr: "192.0.2.0/24" });
  assert.equal(data.cidr, "192.0.2.0/24");
  const branch = (await attendance()).networks.find((network) => network.cidr === "192.0.2.0/24");
  assert.equal(branch.addedBy, "Daniel Lee");
  assert.equal((await admin.call("DELETE", `/api/admin/networks/${branch.id}`)).status, 200);
  assert.equal((await admin.call("DELETE", `/api/admin/networks/${branch.id}`)).status, 404);
});

test("the admin sees their own connection and the newest attempts first", async () => {
  const data = await attendance();
  assert.deepEqual(data.you, { ip: OFFICE_IP, network: `${OFFICE_IP}/32` });
  const names = data.attempts.slice(0, 3).map((attempt) => attempt.name);
  assert.deepEqual(names, ["Daniel Lee", "Sarah Chen", "Alex Morgan"], "this morning's clock-ins, newest first");
  assert.ok(data.attempts.every((attempt) => attempt.accepted));
});

test("resetting the demo keeps the office networks", async () => {
  await admin.call("POST", "/api/reset");
  assert.ok((await attendance()).networks.some((network) => network.cidr === OFFICE_RANGE));
});

// ---- HR attendance view ----

const board = async () => (await admin.call("GET", "/api/admin/attendance/today")).data;
const monthReport = async (month) => (await admin.call("GET", `/api/admin/attendance/month${month ? `?month=${month}` : ""}`)).data;
const rowOf = (rows, name) => rows.find((row) => row.name === name);
const correct = (body) => admin.call("POST", "/api/admin/attendance/corrections", { reason: "Forgot to punch, confirmed by team lead", ...body });

test("today: who's in, who's late and by how much, and who hasn't arrived", async () => {
  const today = await board();
  assert.deepEqual([today.today, today.now, today.scheduled], [TEST_DAY, "12:00", true]);
  const [alexRow, sarahRow, danielRow, minhRow] = ["Alex Morgan", "Sarah Chen", "Daniel Lee", "Minh Tran"].map((name) => rowOf(today.rows, name));
  assert.deepEqual([alexRow.status, alexRow.clockIn, alexRow.lateMinutes], ["working", "08:55", 0]);
  assert.deepEqual([sarahRow.status, sarahRow.lateMinutes], ["working", 3]);
  assert.deepEqual([danielRow.status, danielRow.lateMinutes], ["working", 0]);
  assert.deepEqual([minhRow.status, minhRow.minutesSinceStart], ["not_in", 180]);
  assert.deepEqual(today.counts, { present: 3, remote: 0, late: 1, notIn: 1, notYet: 0, onLeave: 0 });
});

test("today: before the shift starts, nobody is 'not in' yet", async () => {
  await resetAt("08:30");
  const today = await board();
  assert.ok(today.rows.every((row) => row.status === "not_yet"));
  assert.equal(today.counts.notIn, 0);
});

test("today: clocking out early shows how early", async () => {
  await alex.clockOut("17:20");
  const alexRow = rowOf((await board()).rows, "Alex Morgan");
  assert.deepEqual([alexRow.status, alexRow.clockOut, alexRow.earlyMinutes], ["left", "17:20", 40]);
});

test("month: per-person totals match what each employee sees on their own Progress page", async () => {
  const report = await monthReport();
  assert.deepEqual([report.month, report.previous, report.next], ["2026-11", "2026-10", null]);
  const pick = (row) => ({ scheduled: row.scheduled, attended: row.attended, lateDays: row.lateDays, lateMinutes: row.lateMinutes, absent: row.absent, leave: row.leave, leftEarly: row.leftEarly, perfectDays: row.perfectDays });
  assert.deepEqual(pick(rowOf(report.rows, "Alex Morgan")), { scheduled: 8, attended: 8, lateDays: 1, lateMinutes: 6, absent: 0, leave: 0, leftEarly: 0, perfectDays: 6 });
  assert.deepEqual(pick(rowOf(report.rows, "Sarah Chen")), { scheduled: 7, attended: 6, lateDays: 1, lateMinutes: 3, absent: 1, leave: 1, leftEarly: 1, perfectDays: 4 });
  assert.deepEqual(pick(rowOf(report.rows, "Minh Tran")), { scheduled: 8, attended: 6, lateDays: 1, lateMinutes: 15, absent: 1, leave: 0, leftEarly: 0, perfectDays: 5 });

  const own = (await alex.call("GET", "/api/progress")).data.stats;
  assert.deepEqual([own.perfectDays, own.attended], [6, 8], "same numbers as Alex's own page");
});

test("month: later in the month, the demo history covers every working day (no bogus absences)", async () => {
  assert.equal((await admin.call("POST", "/api/test/clock", { now: "2026-11-18T12:00" })).status, 200);
  await admin.call("POST", "/api/reset");
  const report = await monthReport();
  for (const row of report.rows) {
    const expectedAbsent = row.name === "Sarah Chen" || row.name === "Minh Tran" ? 1 : 0; // their one scripted absence
    assert.equal(row.absent, expectedAbsent, `${row.name} absent`);
    assert.equal(row.scheduled + row.leave, 13, `${row.name}: 13 working days from 2 to 18 November (leave days aren't scheduled)`);
  }
});

test("month: earlier months work, future and malformed months are refused", async () => {
  const october = await monthReport("2026-10");
  assert.deepEqual([october.month, october.next], ["2026-10", "2026-11"]);
  for (const bad of ["2026-12", "2026-13", "nov", "2026-1"]) {
    assert.equal((await admin.call("GET", `/api/admin/attendance/month?month=${bad}`)).status, 400, bad);
  }
});

test("corrections: a forgotten clock-in and clock-out, with the reason kept and a Perfect Day credited once", async () => {
  const minh = "EMP006";
  assert.deepEqual((await correct({ employeeId: minh, date: TEST_DAY, kind: "clock_in", time: "08:56" })).data, { ok: true, creditAdded: false });
  let minhRow = rowOf((await board()).rows, "Minh Tran");
  assert.deepEqual([minhRow.status, minhRow.clockIn, minhRow.corrected, minhRow.notes], ["working", "08:56", true, ["Forgot to punch, confirmed by team lead"]]);

  assert.equal((await correct({ employeeId: minh, date: TEST_DAY, kind: "clock_out", time: "18:05" })).data.error, "future", "it's only 12:00");
  await setClock("18:30");
  assert.deepEqual((await correct({ employeeId: minh, date: TEST_DAY, kind: "clock_out", time: "18:05" })).data, { ok: true, creditAdded: true });
  assert.deepEqual((await correct({ employeeId: minh, date: TEST_DAY, kind: "clock_out", time: "18:06" })).data, { ok: true, creditAdded: false }, "never credited twice");
  minhRow = rowOf((await board()).rows, "Minh Tran");
  assert.deepEqual([minhRow.status, minhRow.clockOut], ["left", "18:06"]);
});

test("corrections: fixing a past absence updates the month and the employee's own records", async () => {
  const sarahId = "EMP002";
  assert.equal((await correct({ employeeId: sarahId, date: "2026-11-03", kind: "clock_in", time: "08:58" })).status, 200);
  assert.equal((await correct({ employeeId: sarahId, date: "2026-11-03", kind: "clock_out", time: "18:02" })).data.creditAdded, true);

  const sarahRow = rowOf((await monthReport()).rows, "Sarah Chen");
  assert.deepEqual([sarahRow.absent, sarahRow.perfectDays], [0, 5]);
  const own = (await sarah.call("GET", "/api/progress")).data;
  assert.equal(own.days.find((day) => day.date === "2026-11-03").kind, "perfect");
  const ledger = (await sarah.wallet()).ledger;
  assert.ok(ledger.some((entry) => entry.title === "Attendance correction" && entry.date === TEST_DAY), "credited as a correction");
  assert.ok(ledger.some((entry) => entry.title === "5 Perfect Days milestone"), "and it reached her 5-day milestone");
});

test("corrections: a later real clock-in keeps the corrected time", async () => {
  await resetAt("08:00");
  await setClock("09:30");
  await correct({ employeeId: "EMP001", date: TEST_DAY, kind: "clock_in", time: "08:57" });
  const result = await alex.clockIn("09:31");
  assert.deepEqual([result.data.alreadyClockedIn, result.data.time], [true, "08:57"]);
});

test("corrections: impossible or incomplete fixes are refused", async () => {
  const cases = [
    [{ employeeId: "EMP001", date: TEST_DAY, kind: "clock_in", time: "08:00", reason: "" }, 400, "invalid_reason"],
    [{ employeeId: "EMP001", date: "2026-11-12", kind: "clock_in", time: "08:00" }, 400, "future"],
    [{ employeeId: "EMP001", date: "2026-02-30", kind: "clock_in", time: "08:00" }, 400, "invalid_date"],
    [{ employeeId: "EMP001", date: TEST_DAY, kind: "clock_in", time: "25:00" }, 400, "invalid_time"],
    [{ employeeId: "EMP999", date: TEST_DAY, kind: "clock_in", time: "08:00" }, 404, "unknown_employee"],
    [{ employeeId: "EMP001", date: TEST_DAY, kind: "lunch", time: "08:00" }, 400, "invalid_kind"],
    [{ employeeId: "EMP006", date: TEST_DAY, kind: "clock_out", time: "11:00" }, 409, "no_clock_in"],
    [{ employeeId: "EMP001", date: TEST_DAY, kind: "clock_out", time: "08:30" }, 409, "out_before_in"],
  ];
  for (const [body, status, error] of cases) {
    const result = await correct(body);
    assert.deepEqual([result.status, result.data.error], [status, error], JSON.stringify(body));
  }
  assert.equal(rowOf((await board()).rows, "Alex Morgan").clockIn, "08:55", "nothing changed");
});

test("export: a CSV that opens in Excel, one row per person per day", async () => {
  const response = await fetch(`${BASE}/api/admin/attendance/export?month=2026-11`, { headers: { Cookie: admin.cookie, "CF-Connecting-IP": OFFICE_IP } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.match(response.headers.get("content-disposition"), /attendance-2026-11\.csv/);
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "starts with a byte-order mark for Excel");
  const lines = (await response.text()).replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.equal(lines[0], "Date,Employee ID,Name,Department,Status,Clock in,Clock out,Minutes late,Minutes left early,Recorded as,Correction note");
  assert.ok(lines.includes("2026-11-03,EMP002,Sarah Chen,IT,Absent,,,,,,"), "Sarah's absence");
  assert.ok(lines.includes("2026-11-11,EMP002,Sarah Chen,IT,Late,09:03,,3,,Office,"), "Sarah today");
  assert.ok(lines.includes("2026-11-06,EMP002,Sarah Chen,IT,Leave,,,,,,"));
  assert.equal(lines.filter((line) => line.includes(",EMP001,")).length, 8, "Alex: 8 working days so far, no weekends");

  const forbidden = await fetch(`${BASE}/api/admin/attendance/export`, { headers: { Cookie: alex.cookie } });
  assert.equal(forbidden.status, 403);
});

// ---- Monthly honour wall ----

const wallFor = async (client, month) => (await client.call("GET", `/api/honours${month ? `?month=${month}` : ""}`)).data;
const namesIn = (wall, tier) => wall.tiers.find((entry) => entry.tier === tier).people.map((person) => person.name);

test("honour wall: last month by default, everyone on their own level, no one ranked", async () => {
  const wall = await wallFor(alex);
  assert.deepEqual([wall.month, wall.previous, wall.next], ["2026-10", null, null]);
  assert.deepEqual(wall.tiers.map((entry) => entry.tier), ["perfect_month", "on_time", "full_attendance"]);
  assert.deepEqual(namesIn(wall, "perfect_month"), ["Daniel Lee"]);
  assert.deepEqual(namesIn(wall, "on_time"), ["Alex Morgan"]);
  assert.deepEqual(namesIn(wall, "full_attendance"), ["Sarah Chen"]);
  assert.equal(wall.yourTier, "on_time");
  assert.deepEqual(wall.tiers.flatMap((entry) => entry.people.filter((person) => person.you).map((person) => person.name)), ["Alex Morgan"]);
});

test("honour wall: names and departments only, no numbers about anyone", async () => {
  const wall = await wallFor(sarah);
  const people = wall.tiers.flatMap((entry) => entry.people);
  for (const person of people) assert.deepEqual(Object.keys(person).sort(), ["department", "name", "you"]);
  assert.doesNotMatch(JSON.stringify(wall.tiers.map((entry) => entry.people)), /\d/, "no counts, times or IDs next to anyone's name");
  assert.doesNotMatch(JSON.stringify(wall), /rank|score|percent|leaderboard|EMP0/i);
});

test("honour wall: a corrected absence earns the level, and each level lists people alphabetically", async () => {
  assert.equal((await wallFor(admin)).tiers.some((entry) => entry.people.some((person) => person.name === "Minh Tran")), false, "Minh missed 16 October");
  assert.equal((await correct({ employeeId: "EMP006", date: "2026-10-16", kind: "clock_in", time: "08:55" })).status, 200);
  assert.equal((await correct({ employeeId: "EMP006", date: "2026-10-16", kind: "clock_out", time: "18:02" })).status, 200);
  assert.deepEqual(namesIn(await wallFor(admin), "perfect_month"), ["Daniel Lee", "Minh Tran"]);
});

test("honour wall: only finished months, never this month or the future", async () => {
  for (const month of ["2026-11", "2026-12", "2026-09", "nope"]) {
    assert.equal((await alex.call("GET", `/api/honours?month=${month}`)).status, 400, month);
  }
  assert.equal((await new Client().call("GET", "/api/honours")).status, 401);
});

test("progress: privately, what you're on track for this month", async () => {
  const outlook = async (client) => (await client.call("GET", "/api/progress")).data.honour;
  assert.deepEqual(await outlook(admin), { tier: "perfect_month", daysSoFar: 7, daysLeft: 14 }, "Daniel: every day perfect so far");
  assert.deepEqual(await outlook(alex), { tier: "full_attendance", daysSoFar: 7, daysLeft: 14 }, "Alex was late on 6 November");
  assert.deepEqual(await outlook(sarah), { tier: null, daysSoFar: 6, daysLeft: 14 }, "Sarah missed 3 November");
});
