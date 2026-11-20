import { correctPunch } from "@/lib/server/attendance-report";
import { authorize } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";

// Body: { employeeId, date: "YYYY-MM-DD", kind: "clock_in" | "clock_out", time: "HH:MM", reason }
export async function POST(request: Request) {
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  if (body.kind !== "clock_in" && body.kind !== "clock_out") return json({ ok: false, error: "invalid_kind" }, 400);
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  const result = await correctPunch({
    employeeId: text(body.employeeId),
    date: text(body.date),
    kind: body.kind,
    time: text(body.time),
    reason: text(body.reason),
    actorId: auth.user.id,
  });
  if (result.ok) return json(result);
  return json(result, result.error === "unknown_employee" ? 404 : result.error === "no_clock_in" || result.error === "out_before_in" ? 409 : 400);
}
