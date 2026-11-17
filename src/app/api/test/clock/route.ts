import { authorize } from "@/lib/server/auth";
import { setTestClock, testClockEnabled } from "@/lib/server/clock";
import { json, readJson } from "@/lib/server/http";

// Lets the API tests move the server clock. Does not exist unless the server was started with WORKDAY_TEST_CLOCK=1.
export async function POST(request: Request) {
  if (!testClockEnabled()) return json({ error: "not_found" }, 404);
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  const value = body.now === null ? null : typeof body.now === "string" ? body.now : undefined;
  if (value === undefined) return json({ error: "invalid_clock" }, 400);
  try {
    setTestClock(value);
  } catch {
    return json({ error: "invalid_clock" }, 400);
  }
  return json({ ok: true, now: value });
}
