const { db, transaction, expire } = require("./db");
const calendar = require("../calendar");
const notifications = require("../notifications");
async function work(database = db(), adapters = { calendar, notifications }) {
  await expire(database);
  let count = 0;
  const started = Date.now();
  // Process each effect under a row lock; concurrent workers cannot send it together.
  for (let i = 0; i < 12 && Date.now() - started < 35000; i++) {
    const done = await transaction(async (q) => {
      const job = (
        await q.query(
          `SELECT o.* FROM outbox o JOIN bookings b ON b.id=o.booking_id WHERE o.completed_at IS NULL AND o.available_at<=now() AND b.payment_status='paid' AND b.slot_held AND (o.kind='calendar' OR b.calendar_event_id IS NOT NULL) ORDER BY o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
        )
      ).rows[0];
      if (!job) return false;
      const b = (
        await q.query("SELECT * FROM bookings WHERE id=$1", [job.booking_id])
      ).rows[0];
      try {
        if (job.kind === "calendar") {
          const id = await adapters.calendar.createEvent(b);
          await q.query(
            "UPDATE bookings SET calendar_event_id=$2,booking_status='confirmed',updated_at=now() WHERE id=$1",
            [b.id, id],
          );
        } else await adapters.notifications.send(b, job.kind);
        await q.query(
          "UPDATE outbox SET completed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",
          [job.id],
        );
        await q.query(
          "UPDATE bookings SET notification_sent_at=now() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM outbox WHERE booking_id=$1 AND kind IN('customer_email','company_email') AND completed_at IS NULL)",
          [b.id],
        );
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
      }
      return true;
    }, database);
    if (!done) break;
    count++;
  }
  await database.query("DELETE FROM rate_limits WHERE expires_at<now()");
  return { processed: count };
}
module.exports = { work };
