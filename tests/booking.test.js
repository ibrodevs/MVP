const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
Object.assign(process.env, {
  NODE_ENV: "test",
  PAYMENT_MODE: "mock",
  BOOKING_DEMO_SCHEDULE: "true",
  CALENDAR_MODE: "mock",
  EMAIL_MODE: "mock",
});
const { testDatabase } = require("../scripts/test-database");
const { config } = require("../lib/booking/config");
const { candidates, overlaps } = require("../lib/booking/availability");
const { validate } = require("../lib/booking/validation");
const { createOrder } = require("../lib/booking/orders");
const { confirmVerifiedPayment } = require("../lib/payments");
const { work } = require("../lib/booking/worker");
const { DateTime } = require("luxon");
let database;
const date = () => {
  let d = DateTime.now().setZone("Asia/Dubai").plus({ days: 2 });
  while (d.weekday > 5) d = d.plus({ days: 1 });
  return d.toISODate();
};
const input = (hours = 1, start) => ({
  service_id: "software-development",
  duration_hours: hours,
  start_at: start || candidates(date(), hours)[0].start,
  customer_name: "Иван أحمد",
  customer_email: "test@example.com",
  customer_phone: "+971 50 123 4567",
  company_name: "BTE",
  task_description: "Review our software architecture",
  language: "ru",
  terms_accepted: true,
});
const order = (body = input(), key = randomUUID()) =>
  createOrder(body, key, { database });
const pay = (o, extra = {}) =>
  confirmVerifiedPayment(
    {
      bookingId: o.id,
      paymentId: "payment_" + o.id,
      amountMinor: o.amount_minor,
      currency: "USD",
      ...extra,
    },
    database,
  );
before(async () => {
  database = await testDatabase();
  require("../lib/booking/db").useTestDatabase(database);
});
after(async () => {
  await database.end();
});
beforeEach(async () => {
  await database.query("DELETE FROM outbox");
  await database.query("DELETE FROM bookings");
});
test("server prices and all service/duration combinations", async () => {
  for (const service_id of config().services)
    for (let h = 1; h <= 4; h++) {
      const data = input(h);
      data.service_id = service_id;
      const result = validate(data);
      assert.equal(result.duration_hours, h);
      assert.equal(config().prices[h], h * 15000);
    }
});
test("reject empty, invalid, overlong, spam and malformed inputs", () => {
  for (const extra of [
    { customer_name: "  " },
    { customer_email: "x\n@a.com" },
    { customer_email: "a,b@example.com" },
    { customer_email: "a(comment)@example.com" },
    { customer_phone: "123" },
    { customer_phone: "+1234567890123456" },
    { task_description: "short" },
    { company_name: "x".repeat(161) },
    { terms_accepted: false },
    { website: "spam" },
    { language: "de" },
    { duration_hours: 1.2 },
    { service_id: "unknown" },
  ])
    assert.throws(() => validate({ ...input(), ...extra }));
});
test("whole interval fits work hours; adjacent intervals do not overlap", () => {
  const slots = candidates(date(), 4);
  assert.equal(
    DateTime.fromISO(slots.at(-1).end).setZone("Asia/Dubai").hour,
    19,
  );
  assert.equal(
    overlaps(
      { start: "2026-01-01T09:00Z", end: "2026-01-01T10:00Z" },
      { start: "2026-01-01T10:00Z", end: "2026-01-01T11:00Z" },
    ),
    false,
  );
  assert.equal(candidates("2020-01-01", 1).length, 0);
});
test("server ignores forged price and persists UTC, no prepayment effects", async () => {
  const o = await order({ ...input(2), amount_minor: 1, currency: "AED" });
  assert.equal(o.amount_minor, 30000);
  assert.equal(o.currency, "USD");
  assert.equal((await database.query("SELECT * FROM outbox")).rows.length, 0);
  assert.equal(
    (await database.query("SELECT calendar_event_id FROM bookings")).rows[0]
      .calendar_event_id,
    null,
  );
});
test("idempotent order retries and mismatched retry rejection", async () => {
  const key = randomUUID(),
    body = input();
  const a = await order(body, key),
    b = await order(body, key);
  assert.equal(a.id, b.id);
  await assert.rejects(
    order({ ...body, customer_name: "Other Name" }, key),
    (e) => e.code === "idempotency_conflict",
  );
});
test("simultaneous overlapping bookings allow only one winner", async () => {
  const results = await Promise.allSettled([order(input(4)), order(input(1))]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("database exclusion constraint independently rejects overlap", async () => {
  await order(input(3));
  await assert.rejects(
    database.query(
      `INSERT INTO bookings SELECT gen_random_uuid(),service_id,duration_hours,start_at+interval '1 hour',end_at+interval '1 hour',timezone,customer_name,customer_email,customer_phone,company_name,task_description,amount_minor,currency,language,booking_status,payment_status,NULL,calendar_event_id,terms_accepted_at,terms_version,refund_policy_version,reservation_expires_at,created_at,updated_at,paid_at,notification_sent_at,slot_held,access_hash,'other-key',request_hash FROM bookings`,
    ),
    (e) => e.code === "23P01",
  );
});
test("expiration releases time automatically on next request", async () => {
  const a = await order();
  await database.query(
    "UPDATE bookings SET reservation_expires_at=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  const b = await order();
  assert.notEqual(a.id, b.id);
  assert.equal(
    (
      await database.query("SELECT booking_status FROM bookings WHERE id=$1", [
        a.id,
      ])
    ).rows[0].booking_status,
    "expired",
  );
});
test("calendar failure never reports time as available", async () => {
  await assert.rejects(
    createOrder(input(), randomUUID(), {
      database,
      calendar: {
        busy: async () => {
          throw Error("offline");
        },
      },
    }),
  );
  assert.equal((await database.query("SELECT * FROM bookings")).rows.length, 0);
});
test("payment amount/currency/reference validated, duplicate settlement safe", async () => {
  const o = await order();
  await assert.rejects(pay(o, { amountMinor: 1 }));
  await assert.rejects(pay(o, { currency: "AED" }));
  const a = await pay(o),
    b = await pay(o);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal((await database.query("SELECT * FROM outbox")).rows.length, 3);
  await assert.rejects(pay(o, { paymentId: "other" }));
});
test("one provider payment cannot settle two orders", async () => {
  const a = await order(),
    b = await order(input(1, candidates(date(), 1).at(-1).start));
  await pay(a, { paymentId: "unique" });
  await assert.rejects(
    pay(b, { paymentId: "unique" }),
    (e) => e.code === "23505",
  );
  assert.equal(
    (
      await database.query("SELECT payment_status FROM bookings WHERE id=$1", [
        b.id,
      ])
    ).rows[0].payment_status,
    "pending",
  );
});
test("late payment is retained for manual attention without overlap or effects", async () => {
  const a = await order();
  await database.query(
    "UPDATE bookings SET reservation_expires_at=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  await order();
  const result = await pay(a);
  assert.equal(result.booking_status, "needs_attention");
  assert.equal(
    (
      await database.query(
        "SELECT slot_held,payment_status FROM bookings WHERE id=$1",
        [a.id],
      )
    ).rows[0].slot_held,
    false,
  );
  assert.equal((await database.query("SELECT * FROM outbox")).rows.length, 0);
});
test("paid -> calendar + two notifications; retries do not repeat completed jobs", async () => {
  const o = await order();
  await pay(o);
  let events = 0,
    emails = 0;
  const adapters = {
    calendar: {
      createEvent: async () => {
        events++;
        return "event";
      },
    },
    notifications: {
      send: async () => {
        emails++;
      },
    },
  };
  await work(database, adapters);
  await work(database, adapters);
  assert.equal(events, 1);
  assert.equal(emails, 2);
  const b = (await database.query("SELECT * FROM bookings")).rows[0];
  assert.ok(b.notification_sent_at);
  assert.equal(b.payment_status, "paid");
});
test("calendar failure retains paid status and retries before emails", async () => {
  const o = await order();
  await pay(o);
  let emails = 0;
  await work(database, {
    calendar: {
      createEvent: async () => {
        throw Error("down");
      },
    },
    notifications: { send: async () => emails++ },
  });
  assert.equal(emails, 0);
  let b = (await database.query("SELECT * FROM bookings")).rows[0];
  assert.equal(b.payment_status, "paid");
  assert.equal(b.booking_status, "needs_attention");
  await database.query("UPDATE outbox SET available_at=now()");
  await work(database, {
    calendar: { createEvent: async () => "event" },
    notifications: { send: async () => emails++ },
  });
  assert.equal(emails, 2);
});
test("email failure retries independently; completed recipient not repeated", async () => {
  const o = await order();
  await pay(o);
  let customer = 0;
  const notifications = {
    send: async (_, kind) => {
      if (kind === "customer_email") customer++;
      else throw Error("smtp down");
    },
  };
  await work(database, {
    calendar: { createEvent: async () => "event" },
    notifications,
  });
  await database.query(
    "UPDATE outbox SET available_at=now() WHERE completed_at IS NULL",
  );
  await work(database, {
    calendar: { createEvent: async () => "event" },
    notifications,
  });
  assert.equal(customer, 1);
  assert.equal(
    (await database.query("SELECT payment_status FROM bookings")).rows[0]
      .payment_status,
    "paid",
  );
});
test("HTML mail escapes user data; invitation excludes internal/customer fields", () => {
  const { message, invitation } = require("../lib/notifications");
  const b = {
    ...input(),
    id: randomUUID(),
    end_at: new Date(Date.parse(input().start_at) + 3600000),
    paid_at: new Date(),
    timezone: "Asia/Dubai",
    amount_minor: 15000,
    currency: "USD",
    customer_name: "<script>alert(1)</script>",
  };
  assert.ok(!message(b, "company_email").html.includes("<script>"));
  const ics = invitation(b);
  assert.ok(!ics.includes(b.customer_email));
  assert.ok(!ics.includes(b.task_description));
  for (const language of ["en", "ru", "ar"])
    assert.ok(message({ ...b, language }, "customer_email").subject);
});
test("production never activates mock payment or demo calendar", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.equal(config().mock, false);
  assert.equal(config().paymentAvailable, false);
  assert.equal(config().demo, false);
  process.env.NODE_ENV = previous;
});

test("rate limit is stored in PostgreSQL and rejects excess requests", async () => {
  const { limit } = require("../lib/booking/http");
  const request = {
    url: "/test-" + randomUUID(),
    socket: { remoteAddress: "192.0.2.1" },
  };
  await limit(request, request.url, 1);
  await assert.rejects(limit(request, request.url, 1), (e) => e.status === 429);
  const { rows } = await database.query(
    "SELECT key,hits FROM rate_limits WHERE hits=2",
  );
  assert.ok(rows.some((r) => r.key.length === 64));
});

test("late manual-review payment does not block an unheld interval", async () => {
  const o = await order();
  await database.query(
    "UPDATE bookings SET reservation_expires_at=now()-interval '1 minute' WHERE id=$1",
    [o.id],
  );
  await pay(o);
  const slots = await require("../lib/booking/availability").availability(
    date(),
    1,
    database,
  );
  assert.ok(
    slots.some((s) => Date.parse(s.start) === Date.parse(input().start_at)),
  );
});
