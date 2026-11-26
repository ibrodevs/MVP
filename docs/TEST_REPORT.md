# Test report — 26 November 2026 (final audit)

Environment: macOS arm64, Node.js 24.22.3, real PostgreSQL 16.11 over multiple TCP connections plus PostgreSQL 17.5 via PGlite for the unit suite, installed Google Chrome controlled by Playwright. Production HTTP availability was checked read-only: https://www.bteglobal.ae/ returned HTTP 200 on Vercel. No production changes were made.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run check` | JavaScript syntax passed |
| `npm test` | 28 unit/database/adapter tests passed |
| `TEST_DATABASE_URL=... npm run test:postgres` | 7 real PostgreSQL concurrency/runtime tests passed |
| `npm run build` | 24 allowlisted public assets; server/config files excluded |
| `npm run test:e2e` | 14 Chrome browser tests passed |
| `npm audit --json` | 0 known vulnerabilities |
| `git diff --check` | Passed |
| Visual review | Full-page screenshots at 390 and 1440 px reviewed; generated screenshots cover all seven widths |

Browser widths: **320, 375, 390, 768, 1024, 1440, 1920 px**. Each responsive booking test switches EN/RU/AR, verifies RTL, toggles light/dark and asserts no horizontal overflow. The existing main page is also checked at all seven widths in EN/RU/AR and both themes for the new navigation link, retained project CTA and absence of overflow. Uncaught JavaScript page errors are collected in responsive/main-page tests; none were observed. Screenshots are generated under ignored test-results/ and are not shipped as product assets.

## Server coverage

- All five services and four duration/price combinations; Unicode names and international phones.
- Empty/invalid/overlong fields, malformed email addresses including recipient injection syntax, honeypot and required terms.
- Whole 4-hour intervals fit working hours; past days unavailable; adjacent intervals do not overlap.
- Client amount/currency tampering cannot change server USD total.
- Idempotent order retries; changed request with same key rejected.
- Two simultaneously issued overlapping order requests: one winner. Separate raw SQL insertion verifies PostgreSQL's actual exclusion constraint independently of application checks.
- Expired reservations release on next request.
- Calendar outage fails closed, no unpaid event/email jobs.
- Settlement amount/currency mismatch, duplicate same payment, different payment conflict and reuse of one payment on two orders.
- Late paid order preserved as needs_attention without held slot or notification/calendar jobs.
- Paid booking -> event and both email effects; repeat worker does not repeat completed jobs.
- Calendar failure preserves paid and retries before mail. Email failure retries one recipient independently.
- Escaped email HTML, sanitized ICS, localized confirmation subjects.
- Mock mode cannot activate in production.
- PostgreSQL-backed rate counter rejects requests exceeding the limit.
- Google REST adapter tests: FreeBusy per-calendar errors, deterministic private event creation/recovery, external busy conflict before paid-event insertion. These use controlled HTTP responses and a generated test RSA key, not live Google credentials.

## Browser coverage

- Five service cards, four price choices, calendar month controls, date/time selection, 4-hour summary.
- Duration change clears stale time and rechecks availability.
- Mandatory form/consent gating, international phone validation, form survives language changes.
- Order reservation -> test checkout -> server-confirmed mock payment -> success status; polls for mock event and both notification effects.
- Capability-free status access rejected and redacted status excludes customer email.
- Forged success query does not mark payment successful.
- Method, Origin, private worker auth and hidden local configuration routes.
- Legal translation, RTL and theme persist through main/booking/legal navigation.
- API outage and empty slots state; disabled checkout with production-style payment-unavailable notice.

## Findings corrected during implementation

- Initial dependency audit found vulnerable Nodemailer 7; upgraded to 10.6.1, audit now clean.
- Removed an HTML phone pattern that is incompatible with modern pattern Unicode rules; explicit frontend/backend phone validation remains.
- Added a post-payment Calendar FreeBusy check and stable event recovery before insertion.
- Corrected availability filtering so a paid late order marked for manual review does not block an unheld interval.
- Tightened email parsing to prevent additional-recipient/comment syntax.
- Preserved chosen date in summary while clearing time on duration change.
- Added missing refund/public-offer localization and retained their links in translated legal footers.
- First browser assertion expected `$150` although en-GB Intl returns `US$150`; corrected the assertion, not the price.
- Initial added rate-limit test lacked an exported testable helper; corrected and reran the server suite.

## Not certified / release-dependent

Real PostgreSQL 16.11 was tested with a pool of 10 independent TCP connections; hosted Preview/Production PostgreSQL credentials were not provided. Real Google access/permissions, actual SMTP delivery, Ziina settlement and production Vercel cron remain untested. Unit tests retain the serialized PGlite adapter, but concurrency claims now come from the separate actual PostgreSQL suite.

Emails and calendar events in the end-to-end run used isolated mocks. Tests verify queued effects complete, not real delivery. SMTP's crash-after-acceptance ambiguity remains documented in PAYMENT_INTEGRATION.md. Arbitrary external Calendar writers cannot be atomically locked through FreeBusy; dedicated-calendar access controls and monitoring are required. No Lighthouse score, Safari/Firefox run or production load test is claimed.

## Final audit regressions (executed)

- Public services/prices return 200 without DATABASE_URL; config limiter returns 429 independently of PostgreSQL. Optional Redis limit/failure paths exercised.
- Static build contains only the allowlist; no lib/api/db/docs/scripts/tests/environment/package/config source paths.
- Preview mock configuration works with NODE_ENV=production; Production and unknown Vercel targets deny it. Production mock endpoint returns 404 before DB access.
- Five simultaneous reservations on real PostgreSQL yield one winner; concurrent same-payment settlement queues exactly three unique jobs.
- Paid rows stay paid_pending_calendar, retain exclusion protection and have no premature event or notification timestamp.
- Concurrent workers serialize recipient jobs for one booking, process different bookings in parallel, send each normal effect once and retain a stable notification_sent_at only after both recipient jobs complete.
- A Calendar-only outbox cannot set notification_sent_at. Calendar/SMTP failures retain payment and recover correctly.
- Full HTTP checkout under VERCEL_ENV=preview / NODE_ENV=production, real PostgreSQL, trusted Preview Origin, mock Calendar/email: paid, confirmed, calendar_ready and notifications_sent verified.
- Tests and build also ran under the pinned Node 24 runtime. Total: **49 passing tests (28 + 7 + 14)**.

The initial failed Vercel Preview is documented in AUDIT_2026-11-26.md. Remote Preview success must be established from the post-push Vercel/GitHub check, not from these local results.
