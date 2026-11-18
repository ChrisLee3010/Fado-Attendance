import { connection } from "next/server";
import { isReportableMonth, monthCsv } from "@/lib/server/attendance-report";
import { authorize } from "@/lib/server/auth";
import { today } from "@/lib/server/clock";
import { json } from "@/lib/server/http";

// Downloads ?month=YYYY-MM as a CSV that opens in Excel.
export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const month = new URL(request.url).searchParams.get("month") ?? today().slice(0, 7);
  if (!isReportableMonth(month)) return json({ error: "invalid_month" }, 400);
  return new Response(monthCsv(month), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
