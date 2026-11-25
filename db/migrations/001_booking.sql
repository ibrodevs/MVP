CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY, service_id text NOT NULL, duration_hours smallint NOT NULL CHECK(duration_hours BETWEEN 1 AND 4),
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK(end_at>start_at), timezone text NOT NULL,
 customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text NOT NULL, company_name text NOT NULL DEFAULT '', task_description text NOT NULL,
 amount_minor integer NOT NULL CHECK(amount_minor>0), currency text NOT NULL CHECK(currency='USD'), language text NOT NULL CHECK(language IN('en','ru','ar')),
 booking_status text NOT NULL CHECK(booking_status IN('pending_payment','confirmed','expired','cancelled','needs_attention')),
 payment_status text NOT NULL CHECK(payment_status IN('pending','paid','failed','cancelled','refunded')),
 payment_reference text UNIQUE, calendar_event_id text, terms_accepted_at timestamptz NOT NULL, terms_version text NOT NULL, refund_policy_version text NOT NULL,
 reservation_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, notification_sent_at timestamptz,
 slot_held boolean NOT NULL DEFAULT true, access_hash text NOT NULL, idempotency_hash text NOT NULL UNIQUE, request_hash text NOT NULL,
 EXCLUDE USING gist (tstzrange(start_at,end_at,'[)') WITH &&) WHERE (slot_held AND booking_status IN ('pending_payment','confirmed','needs_attention'))
);
CREATE TABLE IF NOT EXISTS outbox (
 id bigserial PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), kind text NOT NULL CHECK(kind IN('calendar','customer_email','company_email')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, last_error text,
 UNIQUE(booking_id,kind)
);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(available_at) WHERE completed_at IS NULL;
