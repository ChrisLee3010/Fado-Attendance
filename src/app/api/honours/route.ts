import { connection } from "next/server";
import { authorize } from "@/lib/server/auth";
import { defaultWallMonth, honourWall, isWallMonth } from "@/lib/server/honours";
import { json } from "@/lib/server/http";

// The honour wall for ?month=YYYY-MM (default: last month). Everyone with an employee record, and admins, can see it.
export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "employee", "admin");
  if (!auth.ok) return auth.response;

  const month = new URL(request.url).searchParams.get("month") ?? defaultWallMonth();
  if (!isWallMonth(month)) return json({ error: "invalid_month" }, 400);
  return json(honourWall(month, auth.user.employeeId));
}
