const { route, fail, hash } = require("../../lib/booking/http");
const { config } = require("../../lib/booking/config");
const { db } = require("../../lib/booking/db");
const { work } = require("../../lib/booking/worker");
const { confirmVerifiedPayment } = require("../../lib/payments");
module.exports = route(
  "POST",
  async (req) => {
    if (!config().mock) fail(404, "not_found");
    const { id } = req.body || {};
    if (!/^[a-f0-9-]{36}$/i.test(id || "")) fail(400, "invalid");
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const b = (
      await db().query(
        "SELECT * FROM bookings WHERE id=$1 AND access_hash=$2",
        [id, hash(token)],
      )
    ).rows[0];
    if (!b) fail(404, "not_found");
    const result = await confirmVerifiedPayment({
      bookingId: id,
      paymentId: "mock_" + id,
      amountMinor: b.amount_minor,
      currency: b.currency,
    });
    // Preview has no Vercel Cron invocations. Settlement remains durable even if
    // immediate processing fails; the authenticated worker can safely retry later.
    try {
      await work();
    } catch (e) {}
    return result;
  },
  {
    max: 6,
    guard: () => {
      if (!config().mock) fail(404, "not_found");
    },
  },
);
