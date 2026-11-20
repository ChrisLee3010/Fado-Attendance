// Puts the app on a public https address through a Cloudflare quick tunnel, so phones can use it on Wi-Fi or 4G.
//
//   npm run share
//
// - Builds the app and starts it on 127.0.0.1:3200 only, so the tunnel is the only way in from outside.
//   (Anyone who could reach the port directly could send their own CF-Connecting-IP and pretend to be the office.)
// - TRUSTED_PROXY=cloudflare: the visitor's real IP comes from Cloudflare.
// - Uses the normal demo database (data/workday.db), the same one `npm run dev` uses.
// - A quick tunnel gets a new random *.trycloudflare.com address each time it starts, and needs no Cloudflare account.
//   Passkeys (phase 3) will need a fixed address: a named tunnel on a domain.
//
// Needs cloudflared: winget install --id Cloudflare.cloudflared
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";

const PORT = process.env.SHARE_PORT ?? "3200";

// Right after installing, terminals that were already open don't have cloudflared on their PATH yet.
const INSTALLED = ["C:\\Program Files (x86)\\cloudflared\\cloudflared.exe", "C:\\Program Files\\cloudflared\\cloudflared.exe"];
const CLOUDFLARED = (process.platform === "win32" && INSTALLED.find((file) => existsSync(file))) || "cloudflared";
// UV_THREADPOOL_SIZE: password checks run on Node's thread pool, which has 4 threads by default. Using every core makes a
// crowd signing in at the same moment roughly as many times faster as this machine has cores (measured: 1,000 people
// at the same instant took 12 s with 4 threads).
const env = { ...process.env, TRUSTED_PROXY: "cloudflare", COOKIE_SECURE: "1", UV_THREADPOOL_SIZE: String(Math.max(4, availableParallelism())) };
const shell = process.platform === "win32";
const children = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, { env, shell, ...options });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) if (!child.killed) child.kill();
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

function waitFor(child, label) {
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))));
  });
}

console.log("Building the app…");
await waitFor(run("npx", ["next", "build"], { stdio: "inherit" }), "next build");

console.log(`\nStarting the app on http://127.0.0.1:${PORT} (not reachable from the network directly)…`);
const server = run("npx", ["next", "start", "-H", "127.0.0.1", "-p", PORT], { stdio: "inherit" });
server.on("exit", (code) => {
  console.error(`\nThe app stopped (code ${code}).`);
  stopAll();
  process.exit(1);
});

console.log("Opening the Cloudflare tunnel…");
// Spawned without a shell so the path with spaces needs no quoting.
// http2 rather than the default QUIC: QUIC uses UDP, which many office and home networks block (it timed out here).
const tunnel = run(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--protocol", "http2", "--url", `http://127.0.0.1:${PORT}`], { shell: false });
tunnel.on("error", () => {
  console.error("\ncloudflared isn't installed. Install it with:  winget install --id Cloudflare.cloudflared");
  stopAll();
  process.exit(1);
});
tunnel.on("exit", (code) => {
  console.error(`\nThe tunnel closed (code ${code}).`);
  stopAll();
  process.exit(1);
});

let announced = false;
const watch = (chunk) => {
  const text = chunk.toString();
  if (process.env.SHARE_VERBOSE) process.stderr.write(text);
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
  if (match && !announced) {
    announced = true;
    console.log(`\n  Public address:  ${match[0]}\n`);
    console.log("  Open it on a phone. Sign in, then try Clock in on the office Wi-Fi and again on 4G.");
    console.log("  As admin, use \"Add the network I'm on\" from the office Wi-Fi.");
    console.log("  Ctrl+C stops the app and the tunnel.\n");
  }
  // cloudflared tags its error lines " ERR "; show those even when not verbose.
  if (!process.env.SHARE_VERBOSE) for (const line of text.split("\n")) if (line.includes(" ERR ")) console.error(line);
};
tunnel.stdout.on("data", watch);
tunnel.stderr.on("data", watch);
