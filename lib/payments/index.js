// Internal interface only. A future provider adapter MUST authenticate its webhook
// and verify settlement server-to-server before calling confirmVerifiedPayment.
const { transaction } = require("../booking/db");
const { fail } = require("../booking/http");
async function confirmVerifiedPayment(payment, database) {
  const { bookingId, paymentId, amountMinor, currency } = payment;
  if (
    !/^[0-9a-f-]{36}$/i.test(bookingId || "") ||
    typeof paymentId !== "string" ||
    paymentId.length < 1 ||
    paymentId.length > 200 ||
    !Number.isInteger(amountMinor) ||
    currency !== "USD"
  )
    fail(400, "invalid_payment");
  return transaction(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(702150)");
    const b = (
      await q.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [
        bookingId,
      ])
    ).rows[0];
    if (!b) fail(404, "not_found");
    if (b.amount_minor !== amountMinor || b.currency !== currency)
      fail(409, "payment_mismatch");
    if (b.payment_status === "paid") {
      if (b.payment_reference !== paymentId) fail(409, "payment_conflict");
      return { id: b.id, booking_status: b.booking_status, duplicate: true };
    }
    if (!["pending", "failed", "cancelled"].includes(b.payment_status))
      fail(409, "payment_conflict");
    const late =
      b.booking_status !== "pending_payment" ||
      new Date(b.reservation_expires_at) <= new Date();
    const status = late ? "needs_attention" : "confirmed";
    await q.query(
      "UPDATE bookings SET payment_status='paid',payment_reference=$2,paid_at=now(),booking_status=$3,slot_held=$4,updated_at=now() WHERE id=$1",
      [b.id, paymentId, status, !late],
    );
    // Late payments are recorded, but never create calendar events or client confirmations.
    if (!late)
      for (const kind of ["calendar", "customer_email", "company_email"])
        await q.query(
          "INSERT INTO outbox(booking_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [b.id, kind],
        );
    return { id: b.id, booking_status: status, duplicate: false };
  }, database);
}
module.exports = { confirmVerifiedPayment };
