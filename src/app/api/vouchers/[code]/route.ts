import { connection } from "next/server";
import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { checkVoucher } from "@/lib/server/store";

export async function GET(request: Request, context: RouteContext<"/api/vouchers/[code]">) {
  await connection();
  const auth = await authorize(request, "cashier");
  if (!auth.ok) return auth.response;

  const { code } = await context.params;
  return json(checkVoucher(code));
}
