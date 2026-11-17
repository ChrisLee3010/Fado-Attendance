import { connection } from "next/server";
import { authorize, roleHome } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const { name, roles } = auth.user;
  return json({ name, roles, firstName: name.split(" ")[0], home: roleHome(roles) });
}
