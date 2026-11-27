# Neon PostgreSQL — setup and handoff (27 November 2026)

## Provisioned resources

Organization `org-winter-pine-05131981`, project `cool-dream-36213648` (bteglobal):

| Purpose | Branch | Branch ID |
| --- | --- | --- |
| Production database | production | br-broad-recipe-bh5vvix5 |
| Isolated Preview/test | preview-book-consultation | br-cool-hall-bh7n6csb |

Preview was created **schema-only**, with production as parent; production customer rows were not copied. No automatic expiry was added. Public non-secret branch/endpoint metadata is kept in lib/booking/neon-project.json. Passwords/connection strings are never stored there.

Neon CLI 9.10.0 was installed globally using `npm i -g neon@latest`. The requested init created neon.ts and .neon. Automatic optional agent-plugin installation initially failed because of the temporary Node tooling prefix; database setup was completed with the same init arguments plus `--no-agent-setup`, after browser login. neon.ts was reviewed and reduced to PostgreSQL-only configuration, with no auth, Data API, Neon Functions or default branch TTL. `neon deploy` was run against production, and the Preview policy was also applied; both reported no service changes required.

## Driver and connections

The application remains static HTML/JS + Vercel Functions + **pg**. @neon/config and @neon/env are development tooling from the CLI, not a replacement database driver.

- `DATABASE_URL`: pooled endpoint for the app (hostname contains `-pooler`).
- `DATABASE_URL_UNPOOLED`: direct endpoint for migrations/session-level advisory locks.
- `TEST_DATABASE_URL`: direct URL **only** for the registered Preview branch or disposable localhost database.

Local connection strings were pulled by Neon CLI, not invented. They are held in ignored files with mode 0600 and use `sslmode=verify-full`. No TLS verification was disabled.

| Ignored local file | Purpose |
| --- | --- |
| .env.production.local | Production connections, PAYMENT_MODE=disabled; real adapters remain incomplete |
| .env.preview.local | Preview connections, mock payment/Calendar/email, approved Dubai schedule |
| .env.local | Safe local default: Preview, not production |
| .env.test.local | Preview test connection; loaded by npm run test:postgres |
| .neon | Local Neon CLI context, currently Preview |

Never commit these files or paste their values into issue/PR descriptions. `neon env pull` updates credentials in the current context; review branch identity and keep runtime/migration URLs separate. For a specific refresh:

```sh
neon env pull --project-id cool-dream-36213648 --branch preview-book-consultation --service postgres --file .env.preview.local
```

Neon may emit sslmode=require in pulled URLs; retain verified TLS semantics (verify-full) in local/deployment configuration. Keep API/app settings when merging regenerated env files.

## Migration results

Both production and Preview applied existing migrations 001 and 002 successfully, through their **direct** connections. Required public tables bookings, outbox and rate_limits were verified through pooled connections. A private booking_migrations table records file checksums and prevents replay; repeated execution applies zero migrations.

Production was only migrated and queried read-only for verification. No bookings, payment tests, truncation or schema-cleanup tests were run there. Its required tables were empty at verification.

```sh
npm run migrate                 # local Preview by default
npm run migrate:preview          # explicit Preview file
node --env-file=.env.production.local scripts/migrate.js  # explicit production DDL only
node --env-file=.env.preview.local scripts/verify-database.js
```

The migration runner serializes direct sessions with an advisory lock and commits each file with its checksum. Do not edit an applied migration; add a new numbered file. It never runs automatically in a Vercel build.

## Hard safeguards for mock/test operations

lib/booking/database-policy.js allows mock remote connections only to the registered Preview endpoints. Production direct and pooled hosts, unknown remote hosts and endpoint-routing overrides are rejected. Production Vercel targets remain denied regardless of DB URL. Local in-memory demos and disposable localhost databases remain supported.

The PostgreSQL suite validates TEST_DATABASE_URL **before creating any schema**. It creates/drops only a random bte_audit_* schema in Preview. The production connection is never used by that suite. Update non-secret endpoint metadata intentionally if Preview is recreated or its endpoint changes; an unknown endpoint fails closed.

## Approved schedule and provided service settings

Monday–Friday, **10:00–19:00, Dubai / GMT+4 / Asia/Dubai**. Backend defaults, homepage contact hours, booking UI in EN/RU/AR, summary, emails, documentation and tests now use this schedule. UTC remains the database storage format; existing stored timestamps are not reinterpreted.

Prepared values:

```dotenv
GOOGLE_CALENDAR_ID=808bte@gmail.com
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_USER=projects@bteglobal.ae
EMAIL_FROM=projects@bteglobal.ae
BOOKING_NOTIFICATION_EMAIL=projects@bteglobal.ae
BOOKING_TIMEZONE=Asia/Dubai
BOOKING_WORK_DAYS=1,2,3,4,5
BOOKING_WORK_START=10:00
BOOKING_WORK_END=19:00
```

Still needed for **real** adapters: GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY for the service account, write access to the chosen calendar, and SMTP_PASSWORD. These credentials were not fabricated. Preview deliberately uses CALENDAR_MODE=mock and EMAIL_MODE=mock; no Google event or real email delivery is claimed. Real Ziina is not integrated.

## Vercel Preview configuration

Neon variables were written to project ibroits-projects/mvp **only** for target Preview and Git branch feature/book-consultation. Production environment values were not changed. DATABASE_URL and generated Preview CRON_SECRET are sensitive variables; the direct migration URL is not needed by the deployed app and was not uploaded. Other branch-specific values are the approved schedule/service metadata and explicit mock modes.

The helper is intentionally scoped and verifies the target repository and Preview DB host:

```sh
node scripts/configure-vercel-preview.js          # inspect keys/target, no values
node scripts/configure-vercel-preview.js --apply  # write Preview branch values only
```

It uses an existing Vercel CLI login or VERCEL_TOKEN, never prints values, and refuses a production Neon URL. Environment changes apply to subsequent deployments; push only feature/book-consultation. The existing Hobby-compatible daily cron remains a fallback; no production deploy is authorized by this setup.

## Executed checks

- npm run check: passed.
- npm test: 33 passed, including production-host denial and Dubai schedule boundaries.
- npm run test:postgres: 8 passed against the actual Neon Preview branch, including concurrent reservations, duplicate settlement, outbox recovery, full HTTP mock checkout and migration replay protection.
- npm run test:e2e: 14 passed, including three languages/themes, mobile/tablet/desktop and mock checkout.
- npm run build: 24 allowlisted public assets; no server/env/Neon configuration copied.
- npm audit: zero known vulnerabilities.

An old parallelism assertion used a fixed 150ms delivery sleep, which was shorter than real cloud database latency. It was replaced with a barrier proving that two different booking effects can enter concurrently; no concurrency protection was removed.

Live Preview deployment/runtime evidence is recorded in the delivery report after push. Local/cloud Neon tests do not imply that real Google Calendar, SMTP or Ziina have been configured.

## Verified cloud Preview result

Implementation commit: `98f6a71905685e4f0d2b2d890acd1a43afb197ef`.
Deployment: `dpl_2PvSuJGT4PU291FuFnVYNvEcjx25`, READY / Preview.
URL: https://mvp-bi4xx7u4e-ibroits-projects.vercel.app

Using authenticated Preview access, the deployed Vercel functions connected to the pooled Neon Preview URL and completed the following actual requests:

- Public config returned Asia/Dubai, active demo/mock mode and server prices.
- Availability returned a valid Dubai working-day slot.
- Two parallel create-order requests produced exactly one order and one 409 conflict.
- Idempotent order retry returned the same Booking ID.
- Mock settlement produced paid + confirmed, calendar_ready=true and notifications_sent=true.
- Direct inspection of the isolated Preview branch verified exactly 3 completed outbox effects for that test order; duplicate settlement remained idempotent.
- Authorized probes to /lib/booking/neon-project.json, /.env.local, /neon.ts, /scripts/migrate.js and /package.json all returned 404.

The Calendar/email effects were mocks, not external delivery, and no money was charged. A synthetic paid smoke-test booking remains only in Preview. Production was rechecked afterwards: bookings=0, outbox=0, rate_limits=0.

Vercel CLI created a temporary automation protection token for the authenticated smoke check. That exact token was revoked after the test; revocation was verified through project metadata, and a request using the revoked token returned 302 to SSO. SSO protection remains enabled. No production deployment, production environment-variable update, merge into main or real Ziina integration was performed.
