import { authorize } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";
import { isValidTime } from "@/lib/perfect-day";
import { clockOut } from "@/lib/server/store";

export async function POST(request: Request) {
  const auth = await authorize(request, "employee");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  const time = typeof body.time === "string" ? body.time : "18:05";
  if (!isValidTime(time)) return json({ error: "invalid_time" }, 400);

  const result = clockOut(time, auth.user.employeeId!);
  return result.ok ? json(result) : json(result, 409);
}
