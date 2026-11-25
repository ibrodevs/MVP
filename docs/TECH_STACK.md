# Technical stack

- Existing static HTML site and generated `support.js` runtime retained. Original contact form remains independent.
- New booking UI: semantic HTML, plain CSS/JS, Inter / IBM Plex fonts, locally bundled Lucide SVG sprite and license. No new frontend framework or external icon script.
- EN/RU/AR dictionaries, `ta_lang`, `ta_theme`, CSS logical properties and RTL. Form data stays only in page memory; status capability is in the URL fragment, sent as a bearer header, never in a query string.
- Vercel Functions, CommonJS, Node.js. PostgreSQL `pg` pooled connections and parameterized SQL. Prefer a managed serverless-compatible connection pool URL; verify certificates, never disable certificate checks.
- PostgreSQL GiST exclusion constraint over `[start_at,end_at)` ranges. One shared consultant resource. `slot_held` separates paid manual-review records from active blocking intervals.
- Luxon / IANA `Asia/Almaty` for date arithmetic; UTC timestamptz storage, integer USD cents. Prices exist only in `lib/booking/config.js`.
- Google Calendar REST FreeBusy/Events, service-account RS256 JWT with short-lived OAuth token. Private event IDs derive from UUIDs and are stable across retries.
- Transactional outbox, SKIP LOCKED worker, bounded retry backoff. Nodemailer SMTP with TLS and stable Message-ID; sanitized ICS attachment for customer, no customer attendee on the private internal event.
- Node test runner, PGlite PostgreSQL 17 test engine, Playwright/Chrome. PGlite validates the actual exclusion constraint, but is not a substitute for a deployment smoke test against hosted PostgreSQL and multiple independent network clients.

Dependencies are locked in package-lock.json. `npm audit` must be rerun before deployment; advisories evolve.
