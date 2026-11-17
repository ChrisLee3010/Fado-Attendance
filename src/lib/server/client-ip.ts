import { parseIp, type ParsedIp } from "../ip";

// Where the visitor's real IP comes from. This is the whole security of the office check, so it is strict:
//
// - "cloudflare": the app sits behind a Cloudflare Tunnel, which overwrites CF-Connecting-IP on every request.
//   Run the app bound to 127.0.0.1 so the only way in is through the tunnel; otherwise someone on the same
//   network could reach the port directly and send their own CF-Connecting-IP.
// - "local-demo": no proxy. Next.js fills X-Forwarded-For from the socket only when the browser didn't send one,
//   so a browser CAN fake it. Fine for trying the app on your own computer or LAN, never for the real thing.
//
// Unset means local-demo during development and "not configured" in production, which blocks every clock-in.
export type IpMode = "cloudflare" | "local-demo";

export function ipMode(): IpMode | null {
  const configured = process.env.TRUSTED_PROXY;
  if (configured === "cloudflare" || configured === "local-demo") return configured;
  if (!configured && process.env.NODE_ENV !== "production") return "local-demo";
  return null;
}

export type ClientIp = { ip: ParsedIp | null; text: string | null; mode: IpMode | null };

export function clientIp(request: Request): ClientIp {
  const mode = ipMode();
  let raw: string | null = null;
  if (mode === "cloudflare") raw = request.headers.get("cf-connecting-ip");
  if (mode === "local-demo") raw = request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ip = raw ? parseIp(raw) : null;
  return { ip, text: ip ? raw!.trim() : null, mode };
}

export const userAgentOf = (request: Request) => request.headers.get("user-agent")?.slice(0, 300) ?? null;
