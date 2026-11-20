import { connection } from "next/server";
import { authorize } from "@/lib/server/auth";
import { clientIp } from "@/lib/server/client-ip";
import { json } from "@/lib/server/http";
import { getWallet } from "@/lib/server/store";

export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "employee");
  if (!auth.ok) return auth.response;
  return json(await getWallet(auth.user.employeeId!, clientIp(request)));
}
