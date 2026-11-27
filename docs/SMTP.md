# IONOS SMTP — Preview setup and handoff

Updated 27 November 2026. Applies only to `feature/book-consultation` in Vercel project `ibroits-projects/mvp`. Production settings, Neon and Google Calendar credentials are not changed by this setup.

## Settings applied

These six variables are configured for **Preview**, restricted to Git branch **feature/book-consultation**:

```dotenv
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_USER=projects@bteglobal.ae
EMAIL_FROM=projects@bteglobal.ae
BOOKING_NOTIFICATION_EMAIL=projects@bteglobal.ae
EMAIL_MODE=smtp
```

### Client: enter the password safely

1. Open https://vercel.com/ibroits-projects/mvp/settings/environment-variables while signed into the account with project access.
2. Add `SMTP_PASSWORD`. Choose **Preview only** and Git branch **feature/book-consultation**. Enable **Sensitive** before saving.
3. Paste the password for the mailbox `projects@bteglobal.ae`, not the IONOS dashboard login. Save it directly in Vercel. Never send it in chat, commit it or paste it into a terminal command.
4. Report only that it is saved. A new **Preview** deployment is needed to load it; existing deployments retain their old environment. Do not redeploy Production.

No password was invented or stored in Git. Until this variable is present, real SMTP authentication and sending remain unverified. The six public settings above alone do not enable delivery.

## Transport and notifications

`lib/notifications/smtp.js` uses Nodemailer with port 587, mandatory STARTTLS (`requireTLS: true`), TLS >=1.2 and certificate/hostname verification. Authentication must occur over the upgraded connection. Missing credentials, missing STARTTLS or an untrusted certificate fail closed. SMTP logs/debug are disabled; file/URL access from message content is disabled. Each operation has bounded timeouts and observes the worker deadline.

Normal booking mail requires `payment_status=paid`, `paid_at`, `booking_status=confirmed` and an existing Calendar event. Submitting an order, a failed payment or waiting for Calendar sends no booking confirmation. Customer and company messages are localized EN/RU/AR; Arabic HTML uses RTL. The customer ICS excludes internal task/contact details.

The existing transactional outbox serializes recipient effects per booking, skips completed jobs, retries failures with bounded backoff and retains a stable Message-ID. `notification_sent_at` is recorded only after both recipient jobs complete. A failed SMTP job remains pending and cannot mark the booking notified. SMTP cannot guarantee exactly-once delivery after a crash between server acceptance and database commit; investigate ambiguous outcomes before manually resetting jobs.

## Private Preview diagnostics

`POST /api/consultations/smtp-check` accepts JSON `{"action":"verify","language":"en"}` or `{"action":"send","language":"en"}` (languages: en/ru/ar). It requires all of:

- Vercel Preview runtime and an approved isolated database;
- existing deployment protection access;
- `Authorization: Bearer <CRON_SECRET>`; never publish that secret;
- the existing PostgreSQL rate limiter (3 requests/minute per client).

Production returns 404 before database access. The endpoint cannot take a recipient address: a technical test always goes to the agreed mailbox **projects@bteglobal.ae**. It does not create bookings, mark payments or call Google Calendar. Technical messages explicitly state that they are not booking/payment confirmations.

First run `verify`, then one `send` after credentials are saved and a new Preview is ready. Sanitized results distinguish missing settings, authentication failure and SMTP acceptance. `smtpAccepted=true` is not proof of inbox delivery: obtain confirmation from the mailbox owner. Do not repeatedly retry `send` after an ambiguous timeout without checking the inbox.

## Verified and pending

- Live connection to smtp.ionos.com:587: STARTTLS, verified certificate and TLS 1.3 succeeded without AUTH or sending mail.
- Local TLS SMTP fixtures verify authentication success/failure, refusal before insecure AUTH, paid-only notification gating, retry after a recipient rejection, stable Message-ID, timestamp completion and EN/RU/AR formatting.
- No real IONOS authentication or email delivery has been claimed. `SMTP_PASSWORD` is the remaining prerequisite for the independent SMTP check.
- A full live booking-to-email test additionally requires working Google Calendar authentication. Existing GCP Workload Identity identifiers do not themselves implement WIF in the current key-based Calendar adapter. This task preserves those settings; it does not switch the Calendar to a mock.

See TEST_REPORT.md for the executed commands and PAYMENT_INTEGRATION.md for delivery/recovery boundaries.
