import { authorize } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";
import { redeem } from "@/lib/server/store";

export async function POST(request: Request) {
  const auth = await authorize(request, "employee");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  if (typeof body.rewardId !== "string") return json({ error: "invalid_reward" }, 400);

  const result = await redeem(body.rewardId, auth.user.employeeId!);
  if (result.ok) return json(result);
  return json(result, result.error === "unknown_reward" ? 404 : 409);
}
