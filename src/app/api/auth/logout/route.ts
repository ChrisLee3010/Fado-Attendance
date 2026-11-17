import { endSession } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return json({ error: "bad_origin" }, 403);

  await endSession();
  return json({ ok: true });
}
