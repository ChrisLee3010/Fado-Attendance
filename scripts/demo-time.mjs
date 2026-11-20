// Moves the demo clock (only works on a server started with `npm run demo`).
//
//   npm run demo:time -- 08:55      set the time to 08:55 on the demo day
//   npm run demo:time               just show what time the demo clock says
//
// The demo day stays the same; only the time of day moves. Everything the app records uses this clock,
// so clocking in "at 08:55" really records 08:55.
import { DEMO_PASSWORD } from "../src/lib/demo-accounts.ts";

const PORT = Number(process.env.DEMO_PORT ?? 3000);
const BASE = `http://localhost:${PORT}`;
const wanted = process.argv[2];

if (wanted !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(wanted)) {
  console.error(`"${wanted}" isn't a time. Use HH:MM, for example:  npm run demo:time -- 18:05`);
  process.exit(1);
}

let cookie = "";
async function call(method, route, body) {
  const response = await fetch(BASE + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("wq_session="));
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

try {
  const login = await call("POST", "/api/auth/login", { email: "admin@fado.demo", password: DEMO_PASSWORD });
  if (login.status !== 200) throw new Error(`sign-in failed (${login.status})`);
  const board = await call("GET", "/api/admin/attendance/today");
  if (board.status !== 200) throw new Error(`couldn't read the clock (${board.status})`);

  if (wanted === undefined) {
    console.log(`Demo clock: ${board.data.today} ${board.data.now}`);
  } else {
    const set = await call("POST", "/api/test/clock", { now: `${board.data.today}T${wanted}` });
    if (set.status === 404) throw new Error("this server wasn't started with `npm run demo`, so its clock can't be moved");
    if (set.status !== 200) throw new Error(`couldn't set the clock (${set.status})`);
    console.log(`Demo clock set to ${board.data.today} ${wanted}`);
  }
} catch (error) {
  if (error instanceof TypeError) console.error(`Can't reach ${BASE}. Is \`npm run demo\` running?`);
  else console.error(error.message);
  process.exit(1);
}
