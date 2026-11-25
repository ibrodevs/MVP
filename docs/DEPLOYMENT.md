# Local and Vercel deployment

## 1. Prepare staging

Use Node.js 24 on Vercel (local checks also ran on Node.js 20.20). Run `npm ci`. Copy `.env.example` to `.env.local`; never commit secret files. `npm run dev:demo` needs no credentials and cannot run on Vercel or with NODE_ENV=production.

Provision a PostgreSQL database and a trusted pooled connection URL. Use the managed provider's verified TLS configuration. Execute `npm run migrate` with DATABASE_URL; migration is repeatable for a fresh schema but does not modify an older incompatible schema automatically. Back up an existing database before schema changes. PostgreSQL must support GiST range exclusion constraints; no extra extensions are required.

## 2. Environment

| Variable | Value / purpose |
| --- | --- |
| DATABASE_URL | Trusted PostgreSQL connection/pool URL; required for public API rate limiting and bookings |
| APP_BASE_URL | Exact browser origin, e.g. `https://www.bteglobal.ae`; staging must use its actual origin |
| GOOGLE_CALENDAR_ID | Private corporate calendar ID |
| GOOGLE_CLIENT_EMAIL | Service-account email with Calendar access |
| GOOGLE_PRIVATE_KEY | PEM key, actual newlines or escaped `\n` |
| SMTP_HOST / SMTP_PORT | TLS mail service; 465 implicit TLS or 587 STARTTLS |
| SMTP_USER / SMTP_PASSWORD | Mail service credentials |
| EMAIL_FROM | Verified corporate sender |
| BOOKING_NOTIFICATION_EMAIL | Defaults to projects@bteglobal.ae |
| BOOKING_TIMEZONE | Asia/Almaty (Astana, UTC+5); UI content is designed for this timezone |
| BOOKING_WORK_DAYS | Approved ISO weekdays, e.g. 1,2,3,4,5; example is not a final schedule |
| BOOKING_WORK_START / BOOKING_WORK_END | Approved HH:mm same-day working hours |
| BOOKING_SLOT_MINUTES | Default 30 |
| BOOKING_HORIZON_DAYS | Default 60 |
| BOOKING_MIN_LEAD_MINUTES | Default 120 |
| BOOKING_RESERVATION_TTL_MINUTES | Default 15, range 1–60 |
| PAYMENT_MODE | `disabled` in production; `mock` only local/preview; real mode requires future provider code |
| CALENDAR_MODE / EMAIL_MODE | `google` / `smtp` normally; `mock` only with nonproduction mock payment mode |
| BOOKING_DEMO_SCHEDULE | false normally; true only explicitly for a local/preview demo |
| CRON_SECRET | Strong random secret, used by Vercel cron Authorization header |

No Ziina credentials are needed in this phase. Do not put secrets into a client bundle, public file, logs or shell command history. The configuration endpoint returns only public configuration.

Empty work hours keep scheduling closed. Prices, policy version identifiers and USD currency are controlled in `lib/booking/config.js`. After legal approval, version the published policies and update the identifiers together. Changing BOOKING_TIMEZONE also requires updating the Astana-specific UI copy and integration tests.

## 3. Vercel preparation (no production deploy performed)

Import the repository, select Framework Preset **Other**, no frontend build command, no custom static output directory. Keep root HTML assets and `/api` Node functions. Install dependencies with `npm ci`. Set Node.js 24 in project settings. Add the environment variables separately for Preview and Production. Restrict preview access, use a separate staging database/calendar/mail sandbox.

`vercel.json` configures 120-second functions and a minute cron for `/api/consultations/worker`. A plan that supports minute cron scheduling is required; verify plan limits before release. Otherwise provide an authenticated external scheduler at the approved frequency. Cron calls require `Authorization: Bearer <CRON_SECRET>`. Do not expose this secret in the browser. Cleanup also runs opportunistically on availability/order/status requests, so stale reservations cannot be sold as active indefinitely if cron is delayed.

Review Vercel's forwarded-IP guarantees for `x-real-ip` and configure WAF/edge request limits as an additional perimeter. Application limits are shared PostgreSQL counters, not process memory: 6 order/mock-payment requests/minute/IP, 60 availability/status, 120 config. No public endpoint lists customers. Keep logs restricted and do not log request bodies, tokens or external error payloads.

## 4. Release gates

1. Approve schedule and proposals in LEGAL_REVIEW.md; commission final legal translation review.
2. Run all checks and staging PostgreSQL smoke tests, including two independent simultaneous booking requests.
3. Connect the real Calendar and SMTP sandbox; verify private event visibility, recovery and all language emails.
4. Integrate Ziina using PAYMENT_INTEGRATION.md, verify signed webhooks, amount/currency/settlement and return URLs.
5. Test delayed payments, provider retries, recovery after Calendar/SMTP outage and monitoring.
6. Obtain explicit customer approval before production deployment. Until provider readiness, PAYMENT_MODE=disabled and payment controls stay disabled with an explanation.

## 5. Operations

Monitor failed cron executions and inspect unresolved records with restricted database access:

```sql
SELECT id, booking_status, payment_status, paid_at FROM bookings
WHERE booking_status='needs_attention';
SELECT booking_id, kind, attempts, last_error FROM outbox
WHERE completed_at IS NULL AND attempts>3;
```

Never delete paid rows to recover an integration failure. Worker retries with backoff up to one hour; completed jobs are not reprocessed. Do not manually reset completed email jobs without checking provider delivery. Late payments need a human to agree an alternative slot/refund; no automatic refund or new cancellation policy is implemented. Set retention, backup, access and alert ownership with the customer before release. Roll back code through Vercel; retain the database and payment audit record.
