# Deploying the demo to Vercel (free)

Vercel functions have no disk that survives between requests, so on Vercel the app uses **Turso** (hosted SQLite, free
tier). On your own computer and in the API tests it still uses the local file `data/workday.db`; nothing changes there.

## 1. Create the database (Turso)

1. Sign up at https://turso.tech (GitHub login is fine).
2. Create a database. Pick the region **AWS US East (Virginia)**: it is next to Vercel's default function region, so each
   request's database calls stay fast.
3. Copy two values from the database page:
   - the URL, which looks like `libsql://<name>-<user>.turso.io`
   - a token (create one with read and write access).

The app creates its own tables and fills in the fictional demo data the first time it is opened. Do not run any SQL by hand.

## 2. Create the Vercel project

1. https://vercel.com/new, import the GitHub repository `ChrisLee3010/Fado-Attendance`.
2. Production branch: the code is on `clock-in`. Either merge `clock-in` into `master`, or set the production branch to
   `clock-in` under Project Settings, Environments.
3. Framework is detected as Next.js; leave the build settings alone.
4. Add these environment variables (all environments):

| Name | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | the `libsql://...` URL |
| `TURSO_AUTH_TOKEN` | the token |
| `TRUSTED_PROXY` | `vercel` |
| `COOKIE_SECURE` | `1` |

5. Deploy.

Never set `WORKDAY_TEST_CLOCK` or `WORKDAY_NOW` on Vercel: the first lets anyone who is logged in as admin move the clock,
the second freezes the date.

## 3. After the first deploy

- Open the site and log in as `admin@fado.demo`. The first request creates the tables and the demo data (a few seconds).
- Clock-in only works from an office network. The only ones in the list are `127.0.0.1` and `::1`, which a hosted site
  never sees. Go to Admin, Attendance, and add the network you are demoing from (the "current network" button). Sarah
  Chen (`sarah@fado.demo`) is allowed to work remotely, so she can clock in from anywhere.
- The "Đặt lại demo" (reset demo) button on the Admin page wipes and re-seeds the punches, credits and vouchers (not the networks or accounts).

## Limits to know about

- All demo accounts share one password, and the login page is public. Fine for fictional data, not for real people.
- The login lockout (5 wrong passwords) is remembered in memory, and Vercel can run several copies of the app, so it is
  weaker there than on a single server.
