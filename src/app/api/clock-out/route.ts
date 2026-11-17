import { authorize } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { clockOut } from "@/lib/server/store";

// Any time sent in the body is ignored: the server's clock decides when you left.
export async function POST(request: Request) {
  const auth = await authorize(request, "employee");
  if (!auth.ok) return auth.response;

  const result = clockOut(auth.user.employeeId!);
  return result.ok ? json(result) : json(result, 409);
}
