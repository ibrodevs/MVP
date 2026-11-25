const { randomUUID } = require("node:crypto");
const { config } = require("./config");
const { validate } = require("./validation");
const { transaction, expire } = require("./db");
const { availability } = require("./availability");
const { hash, fail } = require("./http");
async function createOrder(input, key, deps = {}) {
  const c = config();
  if (!c.paymentAvailable) fail(503, "payments_unavailable");
  if (typeof key !== "string" || !/^[a-f0-9-]{36,80}$/i.test(key))
    fail(400, "invalid");
  const b = validate(input),
    requestHash = hash(JSON.stringify(b)),
    keyHash = hash(key);
  return transaction(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(702150)");
    await expire(q);
    const existing = (
      await q.query("SELECT * FROM bookings WHERE idempotency_hash=$1", [
        keyHash,
      ])
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash)
        fail(409, "idempotency_conflict");
      return publicOrder(existing, key);
    }
    const date = require("luxon")
      .DateTime.fromISO(b.start_at)
      .setZone(c.timezone)
      .toISODate();
    const free = await availability(
      date,
      b.duration_hours,
      q,
      c,
      deps.calendar,
    );
    if (!free.some((s) => Date.parse(s.start) === Date.parse(b.start_at)))
      fail(409, "slot_unavailable");
    const id = randomUUID(),
      end = new Date(
        Date.parse(b.start_at) + b.duration_hours * 3600000,
      ).toISOString();
    const { rows } = await q.query(
      `INSERT INTO bookings(id,service_id,duration_hours,start_at,end_at,timezone,customer_name,customer_email,customer_phone,company_name,task_description,amount_minor,currency,language,booking_status,payment_status,terms_accepted_at,terms_version,refund_policy_version,reservation_expires_at,access_hash,idempotency_hash,request_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'USD',$13,'pending_payment','pending',now(),$14,$15,now()+($16*interval '1 minute'),$17,$17,$18) RETURNING *`,
      [
        id,
        b.service_id,
        b.duration_hours,
        b.start_at,
        end,
        c.timezone,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.company_name,
        b.task_description,
        c.prices[b.duration_hours],
        b.language,
        c.termsVersion,
        c.refundPolicyVersion,
        c.ttlMinutes,
        keyHash,
        requestHash,
      ],
    );
    return publicOrder(rows[0], key);
  }, deps.database);
}
function publicOrder(b, key) {
  return {
    id: b.id,
    booking_status: b.booking_status,
    payment_status: b.payment_status,
    amount_minor: b.amount_minor,
    currency: b.currency,
    reservation_expires_at: b.reservation_expires_at,
    checkout_url: "/payment.html#" + b.id + ":" + key,
  };
}
module.exports = { createOrder };
