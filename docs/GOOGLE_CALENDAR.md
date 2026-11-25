# Corporate Google Calendar setup

1. Create/select the customer's Google Cloud project. Enable Google Calendar API.
2. Create a dedicated service account. Create a JSON credential in the customer's secure environment. Store only its client_email and private_key in server environment variables; never add the JSON file to this repository.
3. Create a dedicated, private corporate consultation calendar, not an employee's personal calendar. Share it with the service-account email with permission to make changes to events. Do not publish the calendar or share it with customers. Workspace policy may require an administrator to allow service-account sharing.
4. Find its Calendar ID in calendar settings; populate GOOGLE_CALENDAR_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY. Keep CALENDAR_MODE=google. Use staging credentials first.
5. Supply the approved working days/hours, timezone, lead time, slot step and horizon. The Calendar supplies busy intervals; it does not define the business working schedule.
6. Query the availability endpoint for a future working day. Add a busy event, verify all overlapping 1–4-hour intervals disappear. Revoke access temporarily and verify availability fails closed.
7. After a verified test payment, run the authenticated outbox worker. Verify one private event with Booking ID, customer details, task, duration and paid status. Retry the job; the deterministic event ID must prevent a second event.

The server exchanges a service-account RS256 assertion for an OAuth token with calendar scope, caches only the short-lived token, and uses FreeBusy and Events endpoints. The private event contains internal details and has **no customer attendees**. After its successful creation, a separate localized email carries a sanitized ICS calendar attachment to the customer; it contains only time, a generic consultation title, contact email and stable UID. Customer email is never a guest on the private event.

On recovery, the server first checks its deterministic event ID, then FreeBusy before insertion. A conflicting new external event sends the paid booking into needs_attention. A calendar API outage never causes a paid record to be lost or a slot to be assumed free. Outbox retries API failures with backoff. The service account has write access; keep other writers to this dedicated calendar tightly controlled. Google does not provide an atomic FreeBusy-and-insert operation: a human/external system can still write between these two calls. Database exclusion guarantees apply to this booking system; operationally coordinate external writers and monitor conflicts.

References: [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [Events insert and IDs](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account).
