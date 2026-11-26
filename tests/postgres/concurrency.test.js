const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { DateTime } = require("luxon");
const { createOrder } = require("../../lib/booking/orders");
const { confirmVerifiedPayment } = require("../../lib/payments");
const { work } = require("../../lib/booking/worker");
const { candidates, availability } = require("../../lib/booking/availability");
Object.assign(process.env, {
  NODE_ENV: "test",
  PAYMENT_MODE: "mock",
  BOOKING_DEMO_SCHEDULE: "true",
  CALENDAR_MODE: "mock",
  EMAIL_MODE: "mock",
});
if (!process.env.TEST_DATABASE_URL)
  throw Error("Set TEST_DATABASE_URL to a disposable PostgreSQL instance");
const schema = "bte_audit_" + randomUUID().replace(/-/g, "");
let pool, admin;
let day = DateTime.now().setZone("Asia/Almaty").plus({ days: 3 });
while (day.weekday > 5) day = day.plus({ days: 1 });
const date = day.toISODate();
const input = (start = candidates(date, 1)[0].start) => ({
  service_id: "api-integration",
  duration_hours: 1,
  start_at: start,
  customer_name: "Audit Test",
  customer_email: "audit@example.com",
  customer_phone: "+971501234567",
  task_description: "Review integration architecture",
  company_name: "",
  language: "en",
  terms_accepted: true,
});
const order = (body = input()) =>
  createOrder(body, randomUUID(), { database: pool });
const pay = (o) =>
  confirmVerifiedPayment(
    {
      bookingId: o.id,
      paymentId: "audit_" + o.id,
      amountMinor: o.amount_minor,
      currency: "USD",
    },
    pool,
  );
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  await admin.query("CREATE SCHEMA " + schema);
  pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 10,
    options: "-c search_path=" + schema,
    statement_timeout: 10000,
  });
  for (const file of fs
    .readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(fs.readFileSync("db/migrations/" + file, "utf8"));
});
after(async () => {
  await pool?.end();
  if (admin) {
    await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    await admin.end();
  }
});
beforeEach(async () => {
  await pool.query("TRUNCATE outbox,bookings RESTART IDENTITY CASCADE");
});
test("independent PostgreSQL connections reject simultaneous overlapping reservations", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => order()),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM bookings")).rows[0].n,
    1,
  );
});
test("concurrent settlement queues once and remains paid_pending_calendar with held interval", async () => {
  const o = await order();
  const results = await Promise.all([pay(o), pay(o), pay(o)]);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  const b = (await pool.query("SELECT * FROM bookings WHERE id=$1", [o.id]))
    .rows[0];
  assert.equal(b.booking_status, "paid_pending_calendar");
  assert.equal(b.payment_status, "paid");
  assert.equal(b.calendar_event_id, null);
  assert.equal(b.notification_sent_at, null);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM outbox")).rows[0].n,
    3,
  );
  assert.ok(
    !(await availability(date, 1, pool)).some(
      (s) => Date.parse(s.start) === Date.parse(input().start_at),
    ),
  );
});
test("concurrent recipients serialize per booking and notification_sent_at is correct and stable", async () => {
  const o = await order();
  await pay(o);
  let active = 0,
    maxActive = 0;
  const sent = [];
  const adapters = {
    calendar: { createEvent: async () => "event_" + o.id },
    notifications: {
      send: async (b, kind) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(100);
        sent.push(kind);
        active--;
      },
    },
  };
  await work(pool, adapters, { maxJobs: 1 });
  assert.equal(
    (await pool.query("SELECT notification_sent_at FROM bookings")).rows[0]
      .notification_sent_at,
    null,
  );
  await Promise.all(
    Array.from({ length: 5 }, () => work(pool, adapters, { maxJobs: 1 })),
  );
  await work(pool, adapters);
  assert.equal(maxActive, 1);
  assert.deepEqual(sent.sort(), ["company_email", "customer_email"]);
  const timestamp = (
    await pool.query("SELECT notification_sent_at FROM bookings")
  ).rows[0].notification_sent_at;
  assert.ok(timestamp);
  await Promise.all([work(pool, adapters), work(pool, adapters)]);
  assert.equal(
    (
      await pool.query("SELECT notification_sent_at FROM bookings")
    ).rows[0].notification_sent_at.toISOString(),
    timestamp.toISOString(),
  );
  assert.equal(sent.length, 2);
});
test("different bookings can be processed in parallel while same booking stays locked", async () => {
  const a = await order(),
    b = await order(input(candidates(date, 1).at(-1).start));
  await pay(a);
  await pay(b);
  let active = 0,
    maxActive = 0;
  const adapters = {
    calendar: {
      createEvent: async (booking) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(150);
        active--;
        return "event_" + booking.id;
      },
    },
    notifications: { send: async () => {} },
  };
  await Promise.all([
    work(pool, adapters, { maxJobs: 1 }),
    work(pool, adapters, { maxJobs: 1 }),
  ]);
  assert.equal(maxActive, 2);
});
test("calendar and one-recipient failures recover without unpaid or repeated notifications", async () => {
  const o = await order();
  let failure = true;
  let customer = 0;
  const adapters = {
    calendar: {
      createEvent: async () => {
        if (failure) throw Error("calendar down");
        return "event";
      },
    },
    notifications: {
      send: async (_, kind) => {
        if (kind === "company_email" && failure) throw Error("mail down");
        if (kind === "customer_email") customer++;
      },
    },
  };
  await work(pool, adapters);
  assert.equal(customer, 0);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM outbox")).rows[0].n,
    0,
  );
  await pay(o);
  await work(pool, adapters);
  assert.equal(
    (await pool.query("SELECT booking_status FROM bookings")).rows[0]
      .booking_status,
    "needs_attention",
  );
  assert.equal(customer, 0);
  failure = false;
  await pool.query("UPDATE outbox SET available_at=now()");
  await work(pool, adapters, { maxJobs: 1 });
  failure = true;
  await Promise.all([work(pool, adapters), work(pool, adapters)]);
  assert.equal(customer, 1);
  assert.equal(
    (await pool.query("SELECT notification_sent_at FROM bookings")).rows[0]
      .notification_sent_at,
    null,
  );
  failure = false;
  await pool.query(
    "UPDATE outbox SET available_at=now() WHERE completed_at IS NULL",
  );
  await Promise.all([work(pool, adapters), work(pool, adapters)]);
  const final = (await pool.query("SELECT * FROM bookings")).rows[0];
  assert.equal(final.payment_status, "paid");
  assert.equal(final.booking_status, "confirmed");
  assert.ok(final.notification_sent_at);
  assert.equal(customer, 1);
});
test("calendar-only outbox does not set notification_sent_at without both recipient records", async () => {
  const o = await order();
  await pay(o);
  await pool.query("DELETE FROM outbox WHERE kind<>'calendar'");
  await work(pool, {
    calendar: { createEvent: async () => "event" },
    notifications: {
      send: async () => {
        throw Error("unexpected");
      },
    },
  });
  assert.equal(
    (await pool.query("SELECT notification_sent_at FROM bookings")).rows[0]
      .notification_sent_at,
    null,
  );
});
test("HTTP checkout works in Preview with NODE_ENV production using real PostgreSQL", async () => {
  const { spawn } = require("node:child_process");
  const net = require("node:net");
  const port = await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  const child = spawn(process.execPath, ["scripts/dev.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_URL: "audit-preview.vercel.app",
      VERCEL_BRANCH_URL: "audit-branch.vercel.app",
      DATABASE_URL: url.toString(),
      PORT: String(port),
      APP_BASE_URL: "http://localhost:" + port,
      PAYMENT_MODE: "mock",
      CALENDAR_MODE: "mock",
      EMAIL_MODE: "mock",
      BOOKING_DEMO_SCHEDULE: "true",
    },
    stdio: "ignore",
  });
  const base = "http://127.0.0.1:" + port;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(base + "/api/consultations/config");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(50);
    }
    assert.ok(ready, "Preview process did not start");
    const config = await (
      await fetch(base + "/api/consultations/config")
    ).json();
    assert.equal(config.payment_available, true);
    const key = randomUUID(),
      headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        Origin: "https://audit-branch.vercel.app",
      };
    const r = await fetch(base + "/api/consultations/bookings", {
      method: "POST",
      headers,
      body: JSON.stringify(input()),
    });
    assert.equal(r.status, 200);
    const order = await r.json();
    const paid = await fetch(base + "/api/consultations/mock-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
        Origin: "https://audit-preview.vercel.app",
      },
      body: JSON.stringify({ id: order.id }),
    });
    assert.equal(paid.status, 200);
    const status = await (
      await fetch(base + "/api/consultations/status?id=" + order.id, {
        headers: { Authorization: "Bearer " + key },
      })
    ).json();
    assert.equal(status.payment_status, "paid");
    assert.equal(status.booking_status, "confirmed");
    assert.equal(status.calendar_ready, true);
    assert.equal(status.notifications_sent, true);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
});
