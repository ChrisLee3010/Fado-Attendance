import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { consumeVoucher } from "@/lib/server/store";

export async function POST(request: Request, context: RouteContext<"/api/vouchers/[code]/consume">) {
  const auth = await authorize(request, "cashier");
  if (!auth.ok) return auth.response;

  const { code } = await context.params;
  const result = await consumeVoucher(code, auth.user.id);
  if (result.consumed) return json(result);
  return json(result, result.voucher.status === "invalid" ? 404 : 409);
}
