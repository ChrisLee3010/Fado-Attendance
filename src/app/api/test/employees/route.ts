import { authorize } from "@/lib/server/auth";
import { testClockEnabled } from "@/lib/server/clock";
import { json, readJson } from "@/lib/server/http";
import { createLoadEmployees } from "@/lib/server/load-test-data";

// Body: { count }. Creates that many fictional employees for the load test. Does not exist unless the server was
// started with WORKDAY_TEST_CLOCK=1. Never set that for real use.
export async function POST(request: Request) {
  if (!testClockEnabled()) return json({ error: "not_found" }, 404);
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  const count = typeof body.count === "number" ? body.count : NaN;
  if (!Number.isFinite(count) || count < 0) return json({ error: "invalid_count" }, 400);
  return json({ ok: true, ...createLoadEmployees(count) });
}
