# Add multilingual consultation booking with a secure payment integration boundary

BTE Global previously had no way to reserve and pay for a timed consultation. This change adds a branded EN/RU/AR booking page, configurable server prices and availability, PostgreSQL interval reservations, a verified-payment service and durable Calendar/email effects. Existing site architecture, project enquiries and generated support.js are preserved.

Production checkout stays disabled until the Ziina team supplies and integrates its authenticated payment flow. Working hours require customer approval. Calendar and SMTP adapters are implemented; account-backed staging validation is still required. Proposed legal additions are separate from the published policies.

Validation: 28 unit/adapter tests, 7 real PostgreSQL concurrency/runtime tests and 14 Playwright Chrome tests passed, including 320–1920px, RTL, themes, concurrent overlap rejection, expiry, settlement retries and mock end-to-end effects. npm audit reports zero known vulnerabilities. See TEST_REPORT.md for test boundaries and DEPLOYMENT.md / PAYMENT_INTEGRATION.md for the release gates. Push targets feature/book-consultation only; no production deploy or merge into main is authorized.

Final audit fixes the actual Hobby cron build rejection, isolates public assets in generated public/, removes PostgreSQL from public config, enables explicit Preview mock checkout with NODE_ENV=production, introduces paid_pending_calendar and serializes recipient effects per booking. See AUDIT_2026-11-26.md and migrate through 002 before using an existing database.
