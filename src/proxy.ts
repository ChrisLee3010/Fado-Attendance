import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap first gate: no session cookie means no page. Role and session validity are enforced by the API.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("wq_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/progress", "/rewards", "/history", "/honours", "/admin", "/admin/attendance", "/cashier"],
};
