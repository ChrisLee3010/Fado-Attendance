import { authorize } from "@/lib/server/auth";
import { clientIp, userAgentOf } from "@/lib/server/client-ip";
import { json } from "@/lib/server/http";
import { clockOut } from "@/lib/server/store";

// Any time sent in the body is ignored: the server's clock decides when you left.
export async function POST(request: Request) {
  const auth = await authorize(request, "employee");
  if (!auth.ok) return auth.response;

  const result = await clockOut(auth.user.employeeId!, { client: clientIp(request), userAgent: userAgentOf(request) });
  if (result.ok) return json(result);
  return json(result, result.error === "no_clock_in" ? 409 : 403);
}
