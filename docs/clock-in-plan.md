# Plan: real clock-in (office network check + passkey)

Status · 2026-11-18: phases 0–2 done on the `clock-in` branch, plus a quick public tunnel for phone testing
(`npm run share`). **Field test passed** on a real phone through the tunnel: on the company Wi-Fi it was refused
until an admin used "Add the network I'm on", then accepted; on 4G it was refused. Still to watch: whether the
company's public IP stays the same over days.

**Scope change 2026-11-18:** the manager confirmed a localhost demo is enough for the contest. Phases 3 (passkeys) and
the fixed domain move to "rollout ideas" for the product document, together with FADO SSO sign-in.

**Done 2026-11-18/19:** admin attendance view (today, lateness, month totals, corrections, Excel export) and the
monthly honour wall (built, then **removed on 2026-11-20 at the user's request**: the page, menu item, Progress card, API
and tests are gone; commit 21684dc has the last version if it is ever wanted back. The brief still asks for monthly
recognition, so the product document carries a placeholder for it. Original design: levels, not rankings: Perfect month / On time, every day / Never missed a day; finished months
only; private "on track for" card on each person's Progress page).

**Done 2026-11-19:** product document draft (`docs/tai-lieu-san-pham.md`, Vietnamese) and the whole interface in
Vietnamese ("credit" and "Perfect Day" kept as product names; Excel export headings in Vietnamese too).
**Done 2026-11-20:** load test (`npm run test:server`, then `PEOPLE=1500 npm run test:rush`). It found and fixed two real
problems: pages polled every 2 s (now 15 s, paused in background tabs) and the database scanned whole tables (indexes added).
Passes up to 3,000 people (p95 under 150 ms, no errors). Results are in section 7.1 of the product document.
Honour wall removed (see above). **Decision 2026-11-20: monthly recognition is out of scope for now** ("I don't think it
needs it"); the product document lists it under "not in this version" and has no placeholder for it. Still open: the four
`[CẦN BỔ SUNG]` spots in the document (name, real pain points, reward prices, company IP stability).

## Running it

| Setting | What it does |
|---|---|
| `TRUSTED_PROXY=cloudflare` | **Real use.** The visitor IP comes only from Cloudflare's `CF-Connecting-IP`. Start the app bound to localhost (`next start -H 127.0.0.1`) so the tunnel is the only way in; otherwise someone on the same LAN could reach the port directly and send their own header. |
| `TRUSTED_PROXY=local-demo` | Trying it on this PC or LAN. Reads `X-Forwarded-For`, which a browser can fake (Next.js only fills it in when it's missing). The admin page shows a warning banner in this mode. Default during `next dev`. |
| unset in production | Every clock-in is refused with "couldn't read the IP". Fails closed on purpose. |
| `WORKDAY_NOW=2026-11-11T08:55` | Freezes the clock for a demo. |
| `WORKDAY_TEST_CLOCK=1` | Enables `/api/test/clock` (admin only) for the API tests. Never set this for real use. |

### Commands (from the `workday-quest` folder; work in PowerShell, cmd and bash)

| Command | What it does |
|---|---|
| `npm run dev` | The app for trying it yourself, on http://localhost:3000 |
| `npm run test:unit` | Fast tests, no server needed |
| `npm run test:server` | Builds and starts a separate test server on port 3100 with its own throwaway database. Leave it running. Works alongside `npm run dev`. |
| `npm run test:api` | API tests, in a second terminal while `test:server` runs |
| `npm run share` | Builds the app, runs it on 127.0.0.1:3200 with `TRUSTED_PROXY=cloudflare`, and opens a Cloudflare quick tunnel. Prints a public `https://….trycloudflare.com` address for phones. Uses the normal demo database. The address changes every time it starts. Needs `cloudflared` (`winget install --id Cloudflare.cloudflared`). |

### Phone field test (with `npm run share` running)

You need two phones, or one phone you can switch between Wi-Fi and mobile data. Do it at the office to test the
real office network, or at home to rehearse (home Wi-Fi plays the role of "office").

1. **Phone A on Wi-Fi:** open the public address, sign in as `admin@fado.demo`, open **Admin**. Under *Office networks*,
   "You're connecting from" shows the phone's public IP. Tap **Add the network I'm on**.
2. **Phone B on the same Wi-Fi:** sign in as `alex@fado.demo`. The Today page should say *On the office network*.
   Tap **Clock in** → accepted.
3. **Phone B switches to 4G** (Wi-Fi off): reload. It should say *Not on the office network* with a different IP.
   Tap **Clock out** → refused with the VPN hint.
4. **Back on Wi-Fi:** Clock out → accepted.
5. **VPN on** (if available): any punch → refused. VPN off → accepted.
6. **Admin → Clock-in log:** every step above appears with its IP, device and reason.

Things to note for the product document: the IPs you saw on Wi-Fi vs 4G, and whether the Wi-Fi IP stays the same
over a day (some internet plans change it).

Setting one of the variables above by hand differs per shell:
PowerShell `$env:WORKDAY_NOW="2026-11-11T08:55"; npm run dev` · bash `WORKDAY_NOW=2026-11-11T08:55 npm run dev`.

## Goal

Make Workday Quest **the** attendance system for FADO, replacing the fingerprint machine as the brief requires
("chạy độc lập, không kết nối hay tích hợp với máy chấm công hiện tại"). Employees clock in and out on their own
phone in about 2 seconds:

1. Open the app (home-screen icon) → tap **Clock in**.
2. Confirm with the phone's Face ID / fingerprint (passkey). This stops buddy punching.
3. The server checks the request comes from the **office network** (public IP allow-list). This stops fake presence.
4. Remote staff are marked **remote** instead of rejected, if their profile allows remote work.

Everything already built (Perfect Day, credits, milestones, rewards, cashier, leave) stays and runs on top of these real punches.

## What changes in the current app

| Today | After |
|---|---|
| Clock-ins come from seeded `kiosk:` rows | Clock-ins come from the app; the seed stays as fictional *history* only |
| Date frozen at `DEMO_DATE = 2026-11-11` | Real date and time, `Asia/Ho_Chi_Minh`; an optional `WORKDAY_DEMO_DATE` env pins it for tests and demos |
| `clock-out` accepts a `time` from the browser | **The server decides the time.** The browser never sends it |
| "Simulate 18:05 clock-out" button | Real **Clock in / Clock out** button |
| Email + shared demo password | Passkey sign-in for employees; password kept for admin/cashier and as a demo fallback |

## Phases

### 0. Safety baseline
- Commit the current work. Everything after the first create-next-app commit is still uncommitted.

### 1. Real time
- Add a `now()` helper (Vietnam time) and replace every `DEMO_DATE` use with it.
- Generate the fictional history **relative to today** (the last ~2 weeks of workdays), so the demo always looks lived-in.
- Update the unit tests to pin the date through the env variable.

### 2. Clock-in with the office network check
- **Client IP resolution, written defensively:** only trust the header our tunnel or host sets
  (`CF-Connecting-IP` behind Cloudflare). A plain `X-Forwarded-For` sent by the browser can be faked, and trusting it
  would let anyone pretend to be in the office. Controlled by a `TRUSTED_PROXY` env variable.
- New tables:
  - `office_networks`: IP or CIDR range, label, active flag. Admin-editable; supports IPv4 and IPv6.
  - `clock_attempts`: **every** attempt, accepted or not: user, time, IP, user agent, result, reason
    (`ok_office`, `ok_remote`, `not_office_network`, `passkey_failed`, `already_clocked_in`, …).
- `attendance_events` gains `source` (`office` / `remote` / `seed` / `admin_correction`), `ip`, `user_agent`.
- `employees` gains `remote_allowed`.
- New `POST /api/clock-in`. Rework `POST /api/clock-out` the same way.
- When the IP isn't recognized, the message is friendly: *"You don't seem to be on the office network. If you're
  using a VPN, turn it off and try again."*

### 3. Passkeys (anti buddy punching)
- Library: `@simplewebauthn/server` + `@simplewebauthn/browser`.
- New table `passkeys`: credential id, public key, counter, user, device label, created/last used.
- **Enrollment:** the admin generates a one-time invite link → the employee opens it on their phone → registers a passkey → signed in.
- **Each clock-in/out requires a fresh passkey check** with user verification (Face ID / fingerprint). Because of
  that, the employee session can last 30 days. No daily login.
- Lost phone: the admin revokes the passkey and sends a new invite.
- No biometric data ever reaches our server; the phone only signs a challenge.
- Note: passkeys need HTTPS on a **stable domain** (or `localhost` on the PC). Phone testing therefore goes through the tunnel (phase 5).

### 4. Admin tools and bug capture
- **Office networks page:** list/add/remove, plus **"Add the network I'm on now"** (easiest way to register the office).
- **Attempt log:** filter by person, day and result. This is the main debugging tool for IP issues.
- **Manual correction:** the admin adds a missed punch with a required reason. Stored as `admin_correction`, visible in history.
- **"Report a problem" button** in the employee app: saves the message, page, device and the person's last attempt into `problem_reports`.
- Getting bugs to Claude: when it runs on this PC, Claude reads the database and logs directly. Otherwise, export or screenshot the admin pages.

### 5. Making it reachable (testing and the BOD trial)
- **Recommended: Cloudflare Tunnel from this PC** with a fixed hostname. It gives HTTPS (passkeys),
  the real client IP (`CF-Connecting-IP`), keeps SQLite as-is, and lets Claude read the live data while debugging.
  Downside: the PC must stay on during the trial.
- Alternative: a host with a persistent disk (Railway, Render, Fly.io). Vercel isn't a fit: serverless storage can't keep the SQLite file.

### 6. Testing
- **Unit:** IP and CIDR matching (IPv4, IPv6, IPv4-mapped IPv6), Vietnam-time date boundaries.
- **API:** office accepted, outside rejected, remote allowed or not, double clock-in, clock-out without clock-in,
  spoofed `X-Forwarded-For` ignored.
- **Load:** extend `tests/load.mjs` so the whole company clocks in within a minute ("dùng đồng loạt").
  Passkeys are skipped only when a test-only env flag is set; never in production.
- **Field checklist (real phones, at the office):**
  - [ ] Office Wi-Fi → accepted
  - [ ] Same phone on 4G → rejected with the friendly message
  - [ ] VPN on → rejected; VPN off → accepted
  - [ ] Phone using IPv6 → matches correctly
  - [ ] Coworker's phone tries your account → can't pass the passkey check
  - [ ] Each test shows up correctly in the attempt log

## Known limits (for the product document)
- Someone outside the office who knows the Wi-Fi password and is within range (café downstairs) can still pass the network check.
- Full-tunnel VPN users must turn the VPN off to clock in. For production: ask IT to exclude the app's domain from the VPN.
- If the office internet IP changes, an admin must update the list. The attempt log makes this obvious within minutes.
- Like the fingerprint machine, it isn't cheat-proof. The goal is to be at least as good, with less friction.

## Open questions
1. **Deadline:** the brief is dated 05/11 with a 1-week window. What's the actual submission date?
2. How many offices / internet connections does FADO have, and roughly how many staff?
3. How many remote staff, and do they need a location check or is "marked remote" enough?
4. Is a Cloudflare account and a domain available for the tunnel, or should we use a free host?
