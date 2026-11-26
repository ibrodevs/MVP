BEGIN;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_booking_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_booking_status_check CHECK(booking_status IN('pending_payment','paid_pending_calendar','confirmed','expired','cancelled','needs_attention'));
-- Existing "confirmed" paid rows without a calendar event were prematurely confirmed.
UPDATE bookings SET booking_status='paid_pending_calendar',updated_at=now()
WHERE booking_status='confirmed' AND payment_status='paid' AND calendar_event_id IS NULL;
DO $$ DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='bookings'::regclass AND contype='x'
 LOOP EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE bookings ADD CONSTRAINT bookings_held_interval_exclusion EXCLUDE USING gist (tstzrange(start_at,end_at,'[)') WITH &&) WHERE (slot_held AND booking_status IN('pending_payment','paid_pending_calendar','confirmed','needs_attention'));
COMMIT;
