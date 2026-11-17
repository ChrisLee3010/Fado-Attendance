import { connection } from "next/server";
import { listNetworks, recentAttempts } from "@/lib/server/attendance";
import { authorize } from "@/lib/server/auth";
import { clientIp } from "@/lib/server/client-ip";
import { today } from "@/lib/server/clock";
import { json } from "@/lib/server/http";
import { formatRange, rangeForCurrentNetwork } from "@/lib/ip";

// Office networks, plus the clock-in log the admin uses to see why someone couldn't clock in.
export async function GET(request: Request) {
  await connection();
  const auth = await authorize(request, "admin");
  if (!auth.ok) return auth.response;

  const client = clientIp(request);
  return json({
    today: today(),
    ipMode: client.mode,
    you: { ip: client.text, network: client.ip ? formatRange(rangeForCurrentNetwork(client.ip)) : null },
    networks: listNetworks(),
    attempts: recentAttempts(),
  });
}
