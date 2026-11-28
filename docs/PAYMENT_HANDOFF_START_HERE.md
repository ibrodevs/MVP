# BTE Global — payment integration handoff

Prepared 28 November 2026. Repository: https://github.com/ibrodevs/MVP, source branch: feature/book-consultation. This archive contains the complete tracked source required to continue the existing implementation. See the root HANDOFF_MANIFEST.json for the exact source commit, file hashes and archive contents.

## Start here

1. Read PAYMENT_INTEGRATION.md for the implemented settlement boundary and the work required from the Ziina team.
2. Read API.md for order/status contracts and examples. Read DEPLOYMENT.md, NEON.md, GOOGLE_CALENDAR.md and SMTP.md for environment/runtime requirements.
3. Use Node.js 24 and run npm ci, npm run check, npm test, npm run test:e2e and npm run build. Browser tests require Google Chrome on macOS or a separately configured Playwright browser path; see playwright.config.js.
4. Use .env.example as a variable-name template only. Obtain credentials securely from the project owner and enter them directly in the appropriate platform environment. No credentials, live database dumps, customer records, Vercel sessions or local .env files are included.
5. For real PostgreSQL tests, provision a dedicated nonproduction database. npm run test:postgres reads ignored .env.test.local / TEST_DATABASE_URL, rejects production and unknown remote hosts and creates/drops only its own random schema. Registered Neon Preview hosts are documented in lib/booking/neon-project.json. Coordinate with the owner before using a shared Preview branch; never run destructive tests against Production.

## Existing implementation

- Static HTML/CSS/JavaScript frontend; Vercel Node Functions; existing pg database driver and transactional PostgreSQL architecture.
- Server-owned integer USD prices, reservation expiry and interval exclusion; separate booking/payment states.
- Server-only confirmVerifiedPayment in lib/payments/index.js; payment reference uniqueness and amount/currency validation.
- Transactional outbox, paid_pending_calendar, deterministic private Calendar event, EN/RU/AR customer/company emails and retry handling.
- Calendar WIF uses Vercel OIDC, Google STS and service-account impersonation. SMTP requires STARTTLS on port 587 and verified TLS >=1.2.
- Dedicated Neon Preview database protects Production from mock checkout and test schema cleanup.

## Work required from the payment team

Implement the actual Ziina checkout adapter and authenticated raw-body webhook against authoritative provider documentation. Do not invent endpoints, signature formats or secret names. Persist provider correlation and call confirmVerifiedPayment only after server-side verification of successful settlement for the stored order ID, amount and currency. Implement the required failed/cancelled/refunded paths and late-payment/manual-review operations.

Current production PAYMENT_MODE is disabled and paymentAvailable permits only isolated Preview mocks. Order creation currently requires paymentAvailable. Therefore implement provider readiness and checkout creation together; simply changing PAYMENT_MODE cannot activate a real provider. The UI honestly states that online payment is unavailable until this integration is complete.

Never activate mock payment in Production. Never treat a redirect, browser callback or success query as payment proof. Keep the status bearer capability out of provider URLs, logs and query parameters. The internal confirmVerifiedPayment function is not a public unauthenticated endpoint.

The Hobby daily cron at 03:00 UTC is a recovery fallback. A verified webhook must trigger timely durable processing; arrange frequent authenticated retries or an approved scheduler/plan change before live payment launch. SMTP acceptance is not proof of inbox receipt, and SMTP cannot provide strict exactly-once delivery after a crash between acceptance and commit. Google FreeBusy and event insertion are not atomic against external calendar writers.

## Validation and release

Read TEST_REPORT.md for 73 passing automated tests and the separate real Preview checkout, SMTP/WIF checks and owner-approved Calendar cleanup. Existing tests use mocks or local SMTP fixtures unless explicitly described as live. Do not send further live emails or create Calendar events without agreeing recipients and owner consent.

Develop in the feature branch or a dedicated integration branch and use isolated Preview environments. Do not merge main, modify production configuration, enable real payments or deploy provider changes to Production without the owner's separate approval. The owner's publication approval on 28 November covers the current website with checkout disabled, not a future Ziina integration.
