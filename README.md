# BTE Global — corporate website and consultation booking

The existing static corporate website is preserved. `support.js` is generated and is **not edited**. The consultation feature uses plain HTML/CSS/JavaScript, Vercel Node.js Functions and PostgreSQL. Existing project enquiries still use the original mailto form.

## Quick start

Node.js 20.20+ (use a supported Node.js 24 runtime on Vercel), npm:

```sh
npm ci
npm run dev:demo
```

Open http://localhost:3000/book-consultation.html. This **local-only demo** uses an isolated PostgreSQL engine (PGlite), sample Monday–Friday 09:00–18:00 Astana schedule, mock Calendar, mock email and mock payment. Data resets at restart. No email is delivered and no money is charged. PGlite is a development dependency, never the production store.

For real PostgreSQL and configured external services:

```sh
cp .env.example .env.local
# Fill DATABASE_URL and approved schedule; configure Calendar and SMTP.
npm run migrate
npm run dev
```

Production payments remain disabled. Merely returning to a success page never confirms payment. No Ziina API or webhook format has been assumed.

## Verification

```sh
npm run check
npm test
npm run test:e2e
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

No production deployment or remote push has been performed. Customer must approve the working schedule and legal additions, supply PostgreSQL/Google/SMTP access, and commission and test the Ziina adapter. Live Google/SMTP/Ziina delivery cannot be certified without those accounts. SMTP cannot guarantee exactly-once delivery across a crash after acceptance; details and mitigation are documented in the payment handoff.
