import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

class Client {
  cookie = "";

  async call(method, path, body, headers = {}) {
    const response = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
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
  clockOut = (time) => this.call("POST", "/api/clock-out", { time });
  redeem = () => this.call("POST", "/api/redeem", { rewardId: "coffee" });
}

let admin, alex, sarah, cashier;

before(async () => {
  [admin, alex, sarah, cashier] = [new Client(), new Client(), new Client(), new Client()];
  await admin.login("admin@fado.demo");
  await alex.login("alex@fado.demo");
  await sarah.login("sarah@fado.demo");
  await cashier.login("cashier@fado.demo");
});

beforeEach(async () => {
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
    await admin.call("POST", "/api/reset");
    assert.equal((await alex.clockOut(time)).data.qualifies, expected, `clock-out at ${time}`);
    const state = await alex.wallet();
    assert.equal(state.balance, expected ? 40 : 38, `balance after ${time}`);
    assert.equal(state.clockedOut, true, "attendance is still recorded");
  }
});

test("invalid clock-out time is rejected", async () => {
  assert.equal((await alex.clockOut("25:99")).status, 400);
  assert.equal((await alex.clockOut("soon")).status, 400);
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
