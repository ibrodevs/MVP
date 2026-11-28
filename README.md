# BTE Global — corporate website and consultation booking

The existing static corporate website is preserved. `support.js` is generated and is **not edited**. The consultation feature uses plain HTML/CSS/JavaScript, Vercel Node.js Functions and PostgreSQL. Existing project enquiries still use the original mailto form.

## Quick start

Node.js 24.x (pinned for local and Vercel), npm:

```sh
npm ci
npm run dev:demo
```

Open http://localhost:3000/book-consultation.html. This **local-only demo** uses an isolated PostgreSQL engine (PGlite), approved Monday–Friday 10:00–19:00 Dubai (GMT+4) schedule, mock Calendar, mock email and mock payment. Data resets at restart. No email is delivered and no money is charged. PGlite is a development dependency, never the production store.

For real PostgreSQL and configured external services:

```sh
cp .env.example .env.local
# Neon: use pooled DATABASE_URL, direct DATABASE_URL_UNPOOLED; configure real adapters only when credentials are available.
npm run migrate
npm run dev
```

Production payments remain disabled. Merely returning to a success page never confirms payment. No Ziina API or webhook format has been assumed.

## Verification

```sh
npm run check
npm test
npm run test:e2e
npm run test:postgres # loads ignored .env.test.local, Preview only
npm run build
npm audit
```

Browser tests use installed Google Chrome on macOS; elsewhere run `npx playwright install chromium`, or set `PLAYWRIGHT_CHROME_PATH` to a Chrome executable. Tests start and stop their own local server on port 3000. Do not run them against production.

## Main files

| Area | Files |
| --- | --- |
| Existing website | `index.html`, `support.js`, `legal.js`, `legal.css`, existing legal HTML |
| Booking UI | `book-consultation.html`, `consultation.css`, `consultation.js`, `consultation-i18n.js`, `preferences.js`, `assets/icons.svg` |
| Payment results | `payment.html`, `payment-success.html`, `payment-cancelled.html`, `payment-failed.html` |
| Public API | `api/consultations/{config,availability,bookings,status}.js` |
| Test-only payment and worker | `api/consultations/{mock-payment,worker}.js` |
| Server logic | `lib/booking/`, `lib/calendar/`, `lib/payments/`, `lib/notifications/` |
| Schema | `db/migrations/001_booking.sql` |
| Tooling | `scripts/`, `tests/`, `playwright.config.js`, `package.json`, `package-lock.json` |

See [deployment](docs/DEPLOYMENT.md), [stack](docs/TECH_STACK.md), [Calendar](docs/GOOGLE_CALENDAR.md), [payment handoff](docs/PAYMENT_INTEGRATION.md), [API](docs/API.md), [test report](docs/TEST_REPORT.md), [legal proposals](docs/LEGAL_REVIEW.md) and [handoff](docs/HANDOFF.md).

## Release boundaries

Source changes remain in feature/book-consultation. On 28 November 2026 the customer authorized publication of these changes; Production is released directly from this branch without merging main. Real payments remain disabled until the Ziina adapter is delivered and approved. The Dubai schedule is approved and Neon is connected. Customer must approve legal additions and commission/test the Ziina adapter before a future Production release. Live Preview WIF Calendar access and IONOS SMTP acceptance are verified in docs/TEST_REPORT.md; inbox receipt remains subject to mailbox-owner confirmation. Real Ziina remains unconnected. SMTP cannot guarantee exactly-once delivery across a crash after acceptance; details and mitigation are documented in the payment handoff.

## Audited deployment and booking lifecycle

`npm run build` copies only allowlisted client assets to generated `public/`; server sources, SQL, tests, docs and environment files are not static output. Vercel builds `/api` separately.

Paid reservations enter `paid_pending_calendar`; only a successful Calendar job promotes them to `confirmed`. Run `npm run migrate` before deploying this version to an existing database (includes migration 002).

Hobby-compatible configuration uses a daily cron fallback, not a minute cron. Preview does not run Vercel cron: its mock-payment handler immediately attempts outbox processing. A frequent authenticated external scheduler or an approved paid-plan cron is required before enabling real payments. See [environment/deployment guide](docs/DEPLOYMENT.md) and [final audit](docs/AUDIT_2026-11-26.md).

## Connected Neon database

See [Neon setup and safety boundaries](docs/NEON.md). Production and schema-only Preview branches are provisioned and migrated. Local default points to Preview; production URLs are rejected for mock payment and destructive test setup. Preview variables remain scoped to feature/book-consultation; the approved website release adds separate Production runtime settings with payment disabled. The application still uses pg; migrate through the direct URL.

IONOS SMTP Preview setup, safe password entry and delivery verification: [docs/SMTP.md](docs/SMTP.md).

Published website and release checks: [docs/RELEASE_2026-11-28.md](docs/RELEASE_2026-11-28.md). Payment-team archive entry point: [docs/PAYMENT_HANDOFF_START_HERE.md](docs/PAYMENT_HANDOFF_START_HERE.md).
