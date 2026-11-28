# Multilingual consultation booking and payment-team handoff

Adds the EN/RU/AR consultation UI, Dubai schedule, PostgreSQL reservations, verified-payment boundary, durable Calendar/email outbox and private Preview diagnostics. Existing homepage, project enquiries and support.js remain intact.

Live Preview checks verified Neon, Google WIF FreeBusy/event creation and IONOS SMTP acceptance. The owner-approved test event was removed and its slot released. Inbox placement still requires mailbox-owner confirmation.

Validation: 51 backend tests, 8 isolated Neon PostgreSQL tests and 14 Playwright tests, plus a separate live Preview browser checkout. Syntax/build passed; audit found zero vulnerabilities. See TEST_REPORT.md.

On 28 November 2026 the customer authorized publication. Production is deployed directly from feature/book-consultation; main is not merged. Production PAYMENT_MODE=disabled: real Ziina is not integrated and mock checkout remains rejected. The payment team starts with PAYMENT_HANDOFF_START_HERE.md and PAYMENT_INTEGRATION.md.
