# Google Calendar authentication

## Vercel Workload Identity Federation

When GCP_WORKLOAD_IDENTITY_POOL_ID is present, the Calendar adapter uses WIF and does not fall back to private keys on an authentication failure. It obtains the request-scoped Vercel OIDC token through @vercel/oidc, exchanges it at Google STS and impersonates GCP_SERVICE_ACCOUNT_EMAIL using IAM Credentials. Only the short-lived impersonated token with Calendar scope is cached. Tokens and upstream credential error bodies are never logged.

Required server variables: GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL, GOOGLE_CALENDAR_ID, CALENDAR_MODE=google. GCP_PROJECT_ID identifies the project for administration. Optional GCP_AUDIENCE requests a custom Vercel OIDC audience; otherwise the default team audience is used.

The provider must trust the correct Vercel issuer/audience and restrict identities to this project and Preview environment. Grant the corresponding external principal roles/iam.workloadIdentityUser on the service account; enable STS, IAM Credentials and Calendar APIs. Calendar owner must share the target calendar with the service-account email with permission to make changes to events. No JSON service-account key is required. Do not broaden provider trust or modify Production during Preview testing.

References: [Vercel GCP WIF](https://vercel.com/docs/oidc/gcp), [Google STS](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token).

Private POST /api/consultations/calendar-check requires Preview, isolated database and CRON_SECRET. Action verify with an ISO date reads FreeBusy and returns only authentication status and busy count. Action cleanup with bookingId can delete only a paid test booking's deterministic event when the stored and remote company markers both equal BTE Preview E2E and the recipient is projects@bteglobal.ae; it verifies deletion afterwards (including Google cancellation tombstones), then cancels only that Preview test record and releases its held slot while retaining the mock-payment and notification history. No arbitrary calendar/event ID can be supplied. Owner consent is required before a live event test.

## Legacy key-based setup

1. Create/select the customer's Google Cloud project. Enable Google Calendar API.
2. Create a dedicated service account. Create a JSON credential in the customer's secure environment. Store only its client_email and private_key in server environment variables; never add the JSON file to this repository.
3. Create a dedicated, private corporate consultation calendar, not an employee's personal calendar. Share it with the service-account email with permission to make changes to events. Do not publish the calendar or share it with customers. Workspace policy may require an administrator to allow service-account sharing.
4. Find its Calendar ID in calendar settings; populate GOOGLE_CALENDAR_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY. Keep CALENDAR_MODE=google. Use staging credentials first.
5. The approved working schedule is Monday–Friday 10:00–19:00, Dubai/GMT+4 (Asia/Dubai). Configure lead time, slot step and horizon as needed. The Calendar supplies busy intervals; it does not define the business working schedule.
6. Query the availability endpoint for a future working day. Add a busy event, verify all overlapping 1–4-hour intervals disappear. Revoke access temporarily and verify availability fails closed.
7. After a verified test payment, run the authenticated outbox worker. Verify one private event with Booking ID, customer details, task, duration and paid status. Retry the job; the deterministic event ID must prevent a second event.

The server exchanges a service-account RS256 assertion for an OAuth token with calendar scope, caches only the short-lived token, and uses FreeBusy and Events endpoints. The private event contains internal details and has **no customer attendees**. After its successful creation, a separate localized email carries a sanitized ICS calendar attachment to the customer; it contains only time, a generic consultation title, contact email and stable UID. Customer email is never a guest on the private event.

On recovery, the server first checks its deterministic event ID, then FreeBusy before insertion. A conflicting new external event sends the paid booking into needs_attention. A calendar API outage never causes a paid record to be lost or a slot to be assumed free. Outbox retries API failures with backoff. The service account has write access; keep other writers to this dedicated calendar tightly controlled. Google does not provide an atomic FreeBusy-and-insert operation: a human/external system can still write between these two calls. Database exclusion guarantees apply to this booking system; operationally coordinate external writers and monitor conflicts.

References: [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [Events insert and IDs](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account).

Prepared Calendar ID: 808bte@gmail.com. With WIF, GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are not required. Real access must still be verified using the deployed identity and the calendar sharing permissions.

## Live Preview verification — 27 November 2026

Owner consent was obtained to create one test event and delete it afterwards. Fresh Preview authenticated through WIF as bte-booking@bte-global-booking-516005.iam.gserviceaccount.com against calendar 808bte@gmail.com. FreeBusy succeeded before checkout (0 busy intervals). Browser checkout booked 30 November, 11:00–12:00 Asia/Dubai. Before mock settlement: no event and no outbox effects. After settlement: one private PREVIEW TEST event and two SMTP notifications; FreeBusy showed 1 busy interval. Repeated settlement and worker processing did not create another event or resend the completed notification jobs.

Cleanup was subsequently verified on deployment dpl_9KgYSaMX13e2kvHgKqkp42kgN6Qr: remote event deletion confirmed, FreeBusy returned 0 busy intervals, the Preview test booking was cancelled and its slot released. No other calendar event was modified. See TEST_REPORT.md for exact deployment and booking identifiers.
