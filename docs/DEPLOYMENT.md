# Deployment and exact environment configuration

## Runtime and safe build

Node.js **24.x** is pinned in package.json (tested with 24.22.3). Run `npm ci`. Vercel Framework: **Other**. `vercel.json` defines `buildCommand: npm run build`, `outputDirectory: public`, Node function duration **60 seconds**, and daily cron `0 3 * * *` (03:00 UTC). Clear conflicting dashboard build/output overrides. Keep `/api` in the source root: Vercel builds those functions separately from static output.

`npm run build` copies exactly the files in scripts/public-assets.js. It never copies lib/, api/, db/, scripts/, tests/, docs/, package files or environment files into public/. `.vercelignore` excludes local secrets and development/test material from the upload. Do not replace this with a copy of the entire repository. Generated public/ is ignored by Git.

The original failed deployment `dpl_D34GrcPpPN4tQa4qrmJszt6EcfEq` reported: **Hobby accounts are limited to daily cron jobs; `* * * * *` runs more than once per day.** The fatal error was provided by the customer from Vercel build logs. No upgrade is necessary for the committed daily fallback. 60-second functions also fit legacy Hobby limits; the worker bounds external delivery with a 40-second shared deadline. Minute cron must not be restored without a plan supporting it.

## Database migration

Use a separate managed PostgreSQL pool URL for Preview and Production. Verify TLS certificates; never disable certificate verification. Back up an existing database, set direct DATABASE_URL_UNPOOLED (application DATABASE_URL stays pooled), then run:

```sh
npm run migrate
```

The migration runner applies sorted db/migrations/*.sql. Migration 002 adds paid_pending_calendar to the status constraint and interval exclusion predicate, and repairs legacy paid/confirmed records that have no Calendar event. Run it before starting the updated functions against an existing database. No PostgreSQL extensions are required. Keep production migration execution separate from a Preview build: Preview builds must never mutate a production database.

## Exact variables by environment

### Public site / configuration only (no booking)

No database or service secret is required for the page, prices and services. Defaults disable payments; the approved schedule is Mon–Fri 10:00–19:00 Dubai (GMT+4). Availability fails closed until its database/Calendar services are configured. Set APP_BASE_URL to the canonical origin when deploying. Vercel system variables are supplied by Vercel, not by the client.

### Full isolated Preview checkout

| Variable | Required value |
| --- | --- |
| DATABASE_URL | Dedicated Neon Preview pooled URL, migrated through 002 |
| APP_BASE_URL | Actual Preview origin; immutable and branch URLs from Vercel are also accepted automatically |
| PAYMENT_MODE | `mock` |
| CALENDAR_MODE | `mock` (no real Calendar writes) |
| EMAIL_MODE | `mock` (no real messages) |
| BOOKING_DEMO_SCHEDULE | `true` for explicitly labelled Mon–Fri 10:00–19:00 Dubai demo |
| CRON_SECRET | Strong random secret if manually invoking/retrying the private worker |

Vercel supplies VERCEL=1 and VERCEL_ENV=preview; **do not change NODE_ENV to development**. Preview normally has NODE_ENV=production and is explicitly supported. The same mock settings on VERCEL_ENV=production or an unknown Vercel target cannot enable mock payment. VERCEL_TARGET_ENV=production is also denied. Outside Vercel, NODE_ENV=production denies mock.

For a Preview test against real Google/SMTP sandbox accounts, replace the two adapter modes with google/smtp and add the matching credentials below. Use a dedicated sandbox calendar and controlled test recipients. A local PostgreSQL URL cannot be reached by Vercel; provision a remote Preview database.

### Live scheduling and adapters (production payment still disabled)

| Variable | Purpose / default |
| --- | --- |
| DATABASE_URL | Pooled Neon URL for runtime availability/reservation/status/outbox; not required for public config |
| DATABASE_URL_UNPOOLED | Direct URL for local/CI migrations; not required in deployed app |
| APP_BASE_URL | Canonical HTTPS origin; exact Origin check |
| PAYMENT_MODE | `disabled`; real Ziina integration is outside this stage |
| CALENDAR_MODE | `google` |
| GOOGLE_CALENDAR_ID | Prepared: 808bte@gmail.com |
| GOOGLE_CLIENT_EMAIL | Service-account email with Calendar write access |
| GOOGLE_PRIVATE_KEY | PEM key, actual newlines or escaped `\n` |
| EMAIL_MODE | `smtp` |
| SMTP_HOST | Prepared: smtp.ionos.com |
| SMTP_PORT | 587 only; mandatory STARTTLS, verified TLS >=1.2 |
| SMTP_USER / SMTP_PASSWORD | projects@bteglobal.ae; client-supplied Sensitive Preview secret; never commit |
| EMAIL_FROM | projects@bteglobal.ae; verify sender with SMTP provider |
| BOOKING_NOTIFICATION_EMAIL | Defaults to projects@bteglobal.ae |
| CRON_SECRET | Strong random secret shared with the authenticated scheduler |
| BOOKING_DEMO_SCHEDULE | `false`; demo schedule cannot activate in Production |
| BOOKING_WORK_DAYS | Approved 1,2,3,4,5; explicit empty closes schedule |
| BOOKING_WORK_START / BOOKING_WORK_END | Approved 10:00 / 19:00; explicit empty closes schedule |

### Optional scheduling controls

| Variable | Default / limits |
| --- | --- |
| BOOKING_TIMEZONE | Asia/Dubai; UI copy is designed for Dubai GMT+4 |
| BOOKING_SLOT_MINUTES | 30, integer 5–120 |
| BOOKING_RESERVATION_TTL_MINUTES | 15, integer 1–60 |
| BOOKING_HORIZON_DAYS | 60, integer 1–365 |
| BOOKING_MIN_LEAD_MINUTES | 120, integer 0–43200 |

### Optional independent distributed config protection

Set **both or neither**:

- CONFIG_RATE_LIMIT_REDIS_REST_URL — HTTPS Redis REST endpoint supporting EVAL.
- CONFIG_RATE_LIMIT_REDIS_REST_TOKEN — its server-only bearer token.

Public config never consults PostgreSQL. Successful responses are CDN-cacheable for 30 seconds. Its fallback limiter is bounded to 2048 instance counters, 120 requests/minute/IP. This fallback is **per instance**, not a global deployment quota. Configure Redis or an edge/WAF rate rule for a deployment-wide cap. Configured Redis failures return 503 rather than silently allowing traffic. Private/mutating API limits remain PostgreSQL-backed: 6 orders/mock-payments/minute/IP, 60 availability/status. Errors and private responses are no-store.

### Platform and test-only values

VERCEL, VERCEL_ENV, VERCEL_TARGET_ENV, VERCEL_URL and VERCEL_BRANCH_URL are trusted platform-supplied values. Do not set them manually in Vercel project settings to bypass mock guards. TEST_DATABASE_URL is used **only** by `npm run test:postgres` against a disposable local/staging PostgreSQL instance; it is not a deployed app setting. PORT and PLAYWRIGHT_CHROME_PATH are local tooling options. NODE_ENV is runtime-controlled. No Ziina secret is required now.

Do not store customer data or secrets in frontend variables, logs, source files, public/ or Git. `.env.example` is a template only.

## Cron, fulfilment and recovery

Vercel Cron runs only on **Production**, not Preview. The daily cron is a Hobby-compatible recovery fallback, not a promise of timely real-payment fulfilment. Preview's mock endpoint first commits settlement/outbox, then immediately attempts processing; delivery failure cannot undo paid status. Retry via:

```text
GET /api/consultations/worker
Authorization: Bearer <CRON_SECRET>
```

Before real payments are enabled, the future verified webhook must trigger background processing after settlement and an authenticated external scheduler must retry frequently, or an approved Pro plan may use minute cron. Do not depend on one daily run to deliver paid consultations promptly. No real Ziina adapter, plan upgrade or production release is part of this audit.

Expired unpaid reservations are also released opportunistically on availability/order/status calls. Paid_pending_calendar and needs_attention reservations with slot_held=true stay blocked until fulfilled/resolved. Late payments keep paid state but do not acquire an interval or create events automatically.

## Checks and release boundaries

```sh
npm ci
npm run check
npm test
npm run test:postgres # .env.test.local with dedicated Preview direct URL
npm run test:e2e
npm run build
npm audit
```

The PostgreSQL suite creates and drops only a random bte_audit_* schema, using multiple actual server connections. Supply a disposable database. Browser tests start/stop their own local server; macOS uses installed Chrome, elsewhere install Playwright Chromium or set PLAYWRIGHT_CHROME_PATH.

Push only feature/book-consultation and verify Vercel's resulting **Preview** check. Do not merge main or invoke `vercel --prod`. Inspect the deployed config and blocked source paths, if deployment protection permits access. Keep protection enabled; a 401 from protection is not an app runtime failure.

Before any future production release: approve legal additions, verify real Google/SMTP sandbox delivery, configure alerts/retention/backups, finish authenticated Ziina integration and settlement tests, validate production runtime settings and scheduler, and obtain explicit deployment approval.

## Operations

Monitor worker failures and query with restricted database access:

```sql
SELECT id, booking_status, payment_status, paid_at FROM bookings
WHERE booking_status IN ('paid_pending_calendar','needs_attention');
SELECT booking_id, kind, attempts, last_error FROM outbox
WHERE completed_at IS NULL AND attempts>3;
```

Both booking and effect rows are locked during a job, serializing recipients per booking while allowing independent bookings to progress. notification_sent_at is set once only after both actual email jobs complete. SMTP remains subject to crash-after-acceptance ambiguity: for strict provider idempotency use an email API with durable idempotency/reconciliation. Do not reset completed mail jobs without verifying provider delivery. Never delete paid records to recover a service failure.

Official references: [Cron usage/pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cron deployment behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [function limits](https://vercel.com/docs/functions/limitations), [build configuration](https://vercel.com/docs/builds/configure-a-build).

## Connected Neon profiles

See NEON.md for actual branch IDs, ignored local files and deployment-scoped values. Production/test host guards are enforced before destructive test setup; mock mode rejects production URLs even in a Preview runtime. Migration files now have checksummed replay tracking. The default local profile is Preview; an explicit .env.production.local is available only for authorized production migrations/read-only verification.

IONOS Preview setup and safe password entry: [SMTP.md](SMTP.md). The SMTP configuration script preserves existing Neon, Calendar and Production values.

### Current WIF authentication

With GCP_WORKLOAD_IDENTITY_POOL_ID configured, supply GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID and GCP_SERVICE_ACCOUNT_EMAIL. The adapter obtains request-scoped Vercel OIDC and impersonates the service account. GCP_AUDIENCE is optional for a custom provider audience. GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY apply only to the legacy non-WIF path. The configured Preview WIF identity and SMTP password were tested against their real services; see GOOGLE_CALENDAR.md and SMTP.md.
