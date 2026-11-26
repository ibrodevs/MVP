const { db, transaction, expire } = require("./db");
const calendar = require("../calendar");
const notifications = require("../notifications");
async function work(
  database = db(),
  adapters = { calendar, notifications },
  options = {},
) {
  await expire(database);
  let count = 0;
  const signal = AbortSignal.timeout(options.budgetMs || 40000);
  for (let i = 0; i < (options.maxJobs ?? 12) && !signal.aborted; i++) {
    const done = await transaction(async (q) => {
      // Lock BOTH the effect and booking. Different recipient rows for one booking
      // must not run concurrently: otherwise each transaction can miss the other's
      // completion and leave notification_sent_at NULL forever. Skip locked bookings
      // so other workers remain free to process unrelated customers.
      const job = (
        await q.query(`SELECT o.* FROM outbox o JOIN bookings b ON b.id=o.booking_id
        WHERE o.completed_at IS NULL AND o.available_at<=now() AND b.payment_status='paid' AND b.slot_held
        AND (o.kind='calendar' OR (b.calendar_event_id IS NOT NULL AND b.booking_status='confirmed'))
        ORDER BY o.id FOR UPDATE OF o,b SKIP LOCKED LIMIT 1`)
      ).rows[0];
      if (!job || signal.aborted) return false;
      const b = (
        await q.query("SELECT * FROM bookings WHERE id=$1", [job.booking_id])
      ).rows[0];
      let eventId;
      // Only catch external delivery failures. SQL failures must roll back instead
      // of trying to continue an already-aborted PostgreSQL transaction.
      try {
        if (job.kind === "calendar")
          eventId = await adapters.calendar.createEvent(b, { signal });
        else await adapters.notifications.send(b, job.kind, { signal });
      } catch (e) {
        await q.query(
          "UPDATE outbox SET attempts=attempts+1,last_error='external_service_error',available_at=now()+(LEAST(3600,60*power(2,LEAST(attempts,6)))*interval '1 second') WHERE id=$1",
          [job.id],
        );
        if (job.kind === "calendar")
          await q.query(
            "UPDATE bookings SET booking_status='needs_attention',updated_at=now() WHERE id=$1",
            [b.id],
          );
        return true;
      }
      if (job.kind === "calendar")
        await q.query(
          "UPDATE bookings SET calendar_event_id=$2,booking_status='confirmed',updated_at=now() WHERE id=$1",
          [b.id, eventId],
        );
      await q.query(
        "UPDATE outbox SET completed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",
        [job.id],
      );
      // Require both actual recipient jobs and retain the first completion timestamp
      // across repeated invocations. A calendar-only outbox must not look notified.
      await q.query(
        `UPDATE bookings SET notification_sent_at=COALESCE(notification_sent_at,now())
        WHERE id=$1 AND payment_status='paid' AND calendar_event_id IS NOT NULL
        AND (SELECT count(*) FROM outbox WHERE booking_id=$1 AND kind IN('customer_email','company_email') AND completed_at IS NOT NULL)=2`,
        [b.id],
      );
      return true;
    }, database);
    if (!done) break;
    count++;
  }
  await database.query("DELETE FROM rate_limits WHERE expires_at<now()");
  return { processed: count };
}
module.exports = { work };
