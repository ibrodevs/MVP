# Consultation API

All responses are JSON and no-store. Errors use `{ "error": "code", "field": "optional_field" }`, without customer data or external service payloads. Methods are restricted. POST requires application/json, at most 16 KiB, and an Origin matching APP_BASE_URL if supplied. Booking access is a high-entropy bearer capability; no cookies or public customer listing are used.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/consultations/config` | Services, server prices in cents, currency, timezone, horizon, readiness/demo/payment flags |
| GET | `/api/consultations/availability?date=2026-12-01&duration=2` | `{ "slots": [{"start":"...Z","end":"...Z"}] }`, no busy titles or customer details |
| POST | `/api/consultations/bookings` | Creates/reuses a reserved order; see request below |
| GET | `/api/consultations/status?id=<UUID>` | Requires Authorization bearer key; redacted booking/payment status |
| POST | `/api/consultations/mock-payment` | Test-only `{ "id": "UUID" }` plus bearer key; unavailable in production |
| GET | `/api/consultations/worker` | Private scheduler, Authorization bearer CRON_SECRET; `{ "processed": 3 }` |

## Create order

Headers: `Idempotency-Key: <crypto.randomUUID()>`, `Content-Type: application/json`.

```json
{
  "service_id": "software-development",
  "duration_hours": 2,
  "start_at": "2026-12-01T04:00:00.000Z",
  "customer_name": "Customer Name",
  "customer_email": "customer@example.com",
  "customer_phone": "+971 50 123 4567",
  "company_name": "Optional company",
  "task_description": "Describe the technical challenge in at least ten characters.",
  "language": "en",
  "terms_accepted": true,
  "website": ""
}
```

Supported service IDs: `software-development`, `api-integration`, `data-engineering`, `business-automation`, `technology-consulting`. Duration: integer 1–4. Language en/ru/ar. UTC ISO timestamps ending in Z only. Amount and currency from the client are ignored. Phone: international `+` form, 7–15 digits, spaces/parentheses/hyphens allowed. Names Unicode NFC 2–120 chars, email 3–254, company ≤160, task 10–3000. Inputs are trimmed, required blanks/control characters rejected; all SQL is parameterized and email HTML escaped. Honeypot website must be empty.

Response (only mock mode currently permits order creation):

```json
{
  "id": "5d42f50c-d5a3-4b42-a9be-73043ec22027",
  "booking_status": "pending_payment",
  "payment_status": "pending",
  "amount_minor": 30000,
  "currency": "USD",
  "reservation_expires_at": "2026-12-01T03:15:00.000Z",
  "checkout_url": "/payment.html#<id>:<capability>"
}
```

The key is also the status capability in this implementation; it is never logged or stored as plaintext in the database (SHA-256 hashes). Keep it secret and retain it for retries. Same key + same normalized request returns the same order; altered data with that key yields 409 idempotency_conflict. Changing form data creates a new key. Browser keeps the key only in memory/fragment, never stores customer data in localStorage. Do not share the checkout URL or add third-party analytics to payment pages.

Status response includes id, booking_status, payment_status, amount_minor, currency, reservation_expires_at, calendar_ready and notifications_sent booleans. It never returns name/email/phone/task/event ID or a list of orders. Query `success=true` has no effect.

Error status: 400 invalid, 401 worker auth, 403 origin, 404 order not found/no capability, 405 method, 409 slot_unavailable/idempotency_conflict/payment_mismatch/payment_conflict, 413 request size, 415 content type, 429 rate_limited, 503 unavailable. Configuration, Calendar or database failure never yields assumed-free intervals. Production order creation currently returns unavailable; config advertises payment_available=false and UI explains payment unavailability.
