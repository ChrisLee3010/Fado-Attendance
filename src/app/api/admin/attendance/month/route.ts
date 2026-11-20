import { connection } from "next/server";
import { getMonthReport, isReportableMonth } from "@/lib/server/attendance-report";
import { authorize } from "@/lib/server/auth";
import { today } from "@/lib/server/clock";
import { json } from "@/lib/server/http";

// ?month=YYYY-MM, default the current month. Future months are refused.
export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const month = new URL(request.url).searchParams.get("month") ?? today().slice(0, 7);
  if (!isReportableMonth(month)) return json({ error: "invalid_month" }, 400);
  return json(await getMonthReport(month));
}
