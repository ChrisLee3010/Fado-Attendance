import { connection } from "next/server";
import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { getAdminOverview } from "@/lib/server/store";

export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;
  return json(await getAdminOverview());
}
