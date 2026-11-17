import { login, roleHome, setSessionCookie } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return json({ error: "bad_origin" }, 403);

  const body = await readJson(request);
  if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
    return json({ error: "missing_credentials" }, 400);
  }

  const result = await login(body.email, body.password);
  if (!result.ok) return json({ error: result.error }, result.error === "too_many_attempts" ? 429 : 401);

  await setSessionCookie(result.token);
  return json({ user: { name: result.user.name, roles: result.user.roles }, home: roleHome(result.user.roles) });
}
