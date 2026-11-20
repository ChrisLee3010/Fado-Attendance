import { addNetwork } from "@/lib/server/attendance";
import { authorize } from "@/lib/server/auth";
import { clientIp } from "@/lib/server/client-ip";
import { json, readJson } from "@/lib/server/http";

// Body: { label, cidr } for a typed range, or { label, current: true } for the network the admin is on now.
export async function POST(request: Request) {
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  const result = await addNetwork({
    label: typeof body.label === "string" ? body.label : "",
    cidr: typeof body.cidr === "string" ? body.cidr : undefined,
    useCurrent: body.current === true,
    client: clientIp(request),
    actorId: auth.user.id,
  });
  if (result.ok) return json(result);
  return json(result, result.error === "duplicate" ? 409 : 400);
}
