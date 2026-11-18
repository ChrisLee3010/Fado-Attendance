// Starts a server for the API tests on http://localhost:3100. Works the same in PowerShell, cmd and bash.
//
//   npm run test:server     (leave it running)
//   npm run test:api        (in a second terminal)
//
// It builds the app and runs the production server, so it can run next to your own `npm run dev` on port 3000
// (Next.js allows only one dev server per folder). It uses its own throwaway database, so your demo data is untouched.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = process.env.TEST_PORT ?? "3100";
const dataDir = path.join(tmpdir(), "workday-quest-test");
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  WORKDAY_TEST_CLOCK: "1", // lets the tests move the server clock
  TRUSTED_PROXY: "cloudflare", // tests say which network they're on with CF-Connecting-IP
  WORKDAY_DB: path.join(dataDir, "test.db"),
  NEXT_DIST_DIR: ".next-test", // its own build folder, so a running `npm run share` keeps working
};

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", ...args], { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`next ${args[0]} exited with code ${code}`))));
  });
}

console.log("Building the app for the test server…");
await run(["build"]);
console.log(`\nTest server starting on http://localhost:${PORT}. Run \`npm run test:api\` in another terminal. Ctrl+C to stop.\n`);
await run(["start", "-p", PORT]);
