import { connection } from "next/server";
import { getTodayBoard } from "@/lib/server/attendance-report";
import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;
  return json(getTodayBoard());
}
