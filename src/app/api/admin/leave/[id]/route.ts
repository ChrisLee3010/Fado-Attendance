import { authorize } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";
import { decideLeave } from "@/lib/server/store";

export async function POST(request: Request, context: RouteContext<"/api/admin/leave/[id]">) {
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await readJson(request);
  if (body.decision !== "approved" && body.decision !== "rejected") return json({ error: "invalid_decision" }, 400);

  const result = await decideLeave(id, body.decision, auth.user.id);
  if (result.ok) return json(result);
  return json(result, result.error === "not_found" ? 404 : 409);
}
