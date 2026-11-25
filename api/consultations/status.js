const { route, hash, fail } = require("../../lib/booking/http");
const { db, expire } = require("../../lib/booking/db");
module.exports = route("GET", async (req) => {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (
    !/^[a-f0-9-]{36,80}$/i.test(token) ||
    !/^[a-f0-9-]{36}$/i.test(req.query.id || "")
  )
    fail(404, "not_found");
  await expire(db());
  const b = (
    await db().query(
      "SELECT id,booking_status,payment_status,amount_minor,currency,reservation_expires_at,calendar_event_id,notification_sent_at FROM bookings WHERE id=$1 AND access_hash=$2",
      [req.query.id, hash(token)],
    )
  ).rows[0];
  if (!b) fail(404, "not_found");
  const { calendar_event_id, notification_sent_at, ...safe } = b;
  return {
    ...safe,
    calendar_ready: !!calendar_event_id,
    notifications_sent: !!notification_sent_at,
  };
});
