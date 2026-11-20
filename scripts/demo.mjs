// One command to run the app for a live demo on this computer:
//
//   npm run demo
//
// - Builds the app and runs it as it would run for real (no development overlays), on http://localhost:3000.
// - Starts from a fresh demo database every time, so every run begins the same way.
// - Starts the clock at 08:40 on a weekday, so "on time", "late" and "Perfect Day" all make sense whenever you run it
//   (if today is a weekend it uses the most recent Friday). It never moves on its own: you move it with
//       npm run demo:time -- 08:55      (and 09:12, 18:05, ...)
// - This computer counts as "the office", so no phone or internet is needed.
//
// It uses its own data (data/demo.db), so your normal `npm run dev` data is not touched.
// Stop `npm run dev` first if it is using port 3000, or choose another port:  DEMO_PORT=3400 npm run demo
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import net from "node:net";
import path from "node:path";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo-accounts.ts";

const PORT = Number(process.env.DEMO_PORT ?? 3000);
const START_TIME = process.env.DEMO_START ?? "08:40";

// Today in Vietnam, stepping back to Friday on a weekend.
function demoDay() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

if (!(await portIsFree(PORT))) {
  console.error(`\nPort ${PORT} is already in use. Probably \`npm run dev\` is still running.`);
  console.error(`Stop it (Ctrl+C in its terminal), or run the demo on another port:  DEMO_PORT=3400 npm run demo\n`);
  process.exit(1);
}

const day = demoDay();
const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const db = path.join(dataDir, "demo.db");
for (const file of [db, `${db}-wal`, `${db}-shm`]) if (existsSync(file)) rmSync(file);

const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-demo", // its own build folder, so it never clashes with `npm run dev`
  TRUSTED_PROXY: "local-demo", // this computer counts as the office
  WORKDAY_TEST_CLOCK: "1", // lets `npm run demo:time` move the clock. Demo only: never set this for real use.
  WORKDAY_NOW: `${day}T${START_TIME}`,
  WORKDAY_DB: db,
  UV_THREADPOOL_SIZE: String(Math.max(4, availableParallelism())),
};
const shell = process.platform === "win32";
const children = [];
const run = (args) => {
  const child = spawn("npx", ["next", ...args], { env, shell, stdio: "inherit" });
  children.push(child);
  return child;
};
process.on("SIGINT", () => {
  for (const child of children) child.kill();
  process.exit(0);
});

if (!process.env.DEMO_SKIP_BUILD) {
  console.log("Building the app (about a minute the first time)…");
  await new Promise((resolve, reject) => run(["build"]).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`)))));
}

const server = run(["start", "-p", String(PORT)]);
server.on("exit", (code) => process.exit(code ?? 1));

// Wait until it answers, then print the cheat sheet.
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/login`)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const label = (email) => DEMO_ACCOUNTS.find((account) => account.email === email)?.label ?? "";
console.log(`
==============================  DEMO READY  ==============================
  Open:       http://localhost:${PORT}
  Demo day:   ${day} (a weekday), clock frozen at ${START_TIME}
  Password:   ${DEMO_PASSWORD}    (the login page can also fill it in for you)

  alex@fado.demo      ${label("alex@fado.demo")}
  sarah@fado.demo     ${label("sarah@fado.demo")}
  admin@fado.demo     ${label("admin@fado.demo")}
  cashier@fado.demo   ${label("cashier@fado.demo")}

  Move the clock (in a second terminal):   npm run demo:time -- 08:55
  Two people at once: use a normal window and a private/incognito window.
  Ctrl+C here stops the demo.
==========================================================================
`);
