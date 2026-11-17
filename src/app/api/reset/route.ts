import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { resetDatabase } from "@/lib/server/db";

export async function POST(request: Request) {
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  resetDatabase();
  return json({ ok: true });
}
