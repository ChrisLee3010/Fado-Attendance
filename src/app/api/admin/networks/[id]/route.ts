import { removeNetwork } from "@/lib/server/attendance";
import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

export async function DELETE(request: Request, context: RouteContext<"/api/admin/networks/[id]">) {
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return json({ error: "not_found" }, 404);
  return (await removeNetwork(Number(id))) ? json({ ok: true }) : json({ error: "not_found" }, 404);
}
