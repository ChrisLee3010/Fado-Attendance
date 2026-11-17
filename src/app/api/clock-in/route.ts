import { authorize } from "@/lib/server/auth";
import { clientIp, userAgentOf } from "@/lib/server/client-ip";
import { json } from "@/lib/server/http";
import { clockIn } from "@/lib/server/store";

// The time comes from the server's clock and the location from the request's IP; nothing in the body is used.
export async function POST(request: Request) {
  const auth = await authorize(request, "employee");
  if (!auth.ok) return auth.response;

  const result = clockIn(auth.user.employeeId!, { client: clientIp(request), userAgent: userAgentOf(request) });
  return result.ok ? json(result) : json(result, 403);
}
