const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { SMTPServer } = require("smtp-server");
const nodemailer = require("nodemailer");
const smtp = require("../lib/notifications/smtp");
const notifications = require("../lib/notifications");
const { testDatabase } = require("../scripts/test-database");
const { createOrder } = require("../lib/booking/orders");
const { confirmVerifiedPayment } = require("../lib/payments");
const { work } = require("../lib/booking/worker");
const { candidates } = require("../lib/booking/availability");
const { DateTime } = require("luxon");
Object.assign(process.env, {
  NODE_ENV: "test",
  PAYMENT_MODE: "mock",
  CALENDAR_MODE: "mock",
  EMAIL_MODE: "smtp",
  SMTP_HOST: "smtp.ionos.com",
  SMTP_PORT: "587",
  SMTP_USER: "projects@bteglobal.ae",
  SMTP_PASSWORD: "fixture-only-local-smtp",
  EMAIL_FROM: "projects@bteglobal.ae",
  BOOKING_NOTIFICATION_EMAIL: "projects@bteglobal.ae",
});
let certificate, key, directory, database;
before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "bte-smtp-test-"));
  const cfg = path.join(directory, "openssl.cnf");
  fs.writeFileSync(
    cfg,
    "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n",
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-nodes",
      "-keyout",
      path.join(directory, "key.pem"),
      "-out",
      path.join(directory, "cert.pem"),
      "-days",
      "2",
      "-config",
      cfg,
    ],
    { stdio: "ignore" },
  );
  key = fs.readFileSync(path.join(directory, "key.pem"));
  certificate = fs.readFileSync(path.join(directory, "cert.pem"));
  database = await testDatabase();
  require("../lib/booking/db").useTestDatabase(database);
});
after(async () => {
  await database.end();
  fs.rmSync(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await database.query("DELETE FROM outbox");
  await database.query("DELETE FROM bookings");
});
function paid() {
  return {
    id: randomUUID(),
    service_id: "api-integration",
    duration_hours: 1,
    start_at: "2027-01-04T06:00:00Z",
    end_at: "2027-01-04T07:00:00Z",
    timezone: "Asia/Dubai",
    customer_name: "أحمد Иван",
    customer_email: "projects@bteglobal.ae",
    customer_phone: "+971501234567",
    company_name: "Test",
    task_description: "Private technical context <script>x</script>",
    language: "en",
    amount_minor: 15000,
    currency: "USD",
    booking_status: "confirmed",
    payment_status: "paid",
    paid_at: new Date(),
    calendar_event_id: "event",
  };
}
async function server(options = {}) {
  const state = { auth: [], attempts: [], accepted: [] };
  const s = new SMTPServer({
    secure: false,
    key,
    cert: certificate,
    logger: false,
    allowInsecureAuth: true,
    ...(options.noTls ? { disabledCommands: ["STARTTLS"] } : {}),
    onAuth(auth, session, cb) {
      state.auth.push({ secure: session.secure });
      if (
        auth.username === "projects@bteglobal.ae" &&
        auth.password === "fixture-only-local-smtp"
      )
        cb(null, { user: "fixture" });
      else {
        const e = Error("fixture auth rejected");
        e.responseCode = 535;
        cb(e);
      }
    },
    onData(stream, session, cb) {
      let data = "";
      stream.on("data", (chunk) => (data += chunk.toString()));
      stream.on("end", () => {
        state.attempts.push(data);
        if (options.reject?.(data)) {
          const e = Error("fixture temporary rejection");
          e.responseCode = 451;
          cb(e);
        } else {
          state.accepted.push(data);
          cb(null, "fixture queued");
        }
      });
    },
  });
  s.on("error", () => {});
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const port = s.server.address().port;
  const factory = (opts) =>
    nodemailer.createTransport({
      ...opts,
      host: "127.0.0.1",
      port,
      tls: {
        ...opts.tls,
        servername: "localhost",
        ...(options.untrusted ? {} : { ca: certificate }),
      },
    });
  return {
    ...state,
    factory,
    close: () => new Promise((resolve) => s.close(resolve)),
  };
}
test("IONOS settings require authenticated STARTTLS, verified certificates and TLS >=1.2", () => {
  const opts = smtp.smtpOptions();
  assert.equal(opts.port, 587);
  assert.equal(opts.secure, false);
  assert.equal(opts.requireTLS, true);
  assert.equal(opts.ignoreTLS, false);
  assert.equal(opts.tls.rejectUnauthorized, true);
  assert.equal(opts.tls.minVersion, "TLSv1.2");
  assert.equal(opts.logger, false);
  assert.equal(opts.debug, false);
  assert.throws(() => smtp.smtpOptions({ ...process.env, SMTP_PORT: "465" }));
  assert.throws(() => smtp.smtpOptions({ ...process.env, SMTP_PASSWORD: "" }));
});
test("Nodemailer upgrades the local fixture connection before AUTH and accepts one test message", async () => {
  const s = await server();
  try {
    await smtp.verify({ transportFactory: s.factory });
    const result = await notifications.send(paid(), "customer_email", {
      transportFactory: s.factory,
    });
    assert.equal(result.accepted, true);
    assert.equal(s.accepted.length, 1);
    assert.ok(s.auth.every((x) => x.secure));
    assert.match(
      s.accepted[0],
      /Message-ID:\s*<.*customer_email@bteglobal.ae>/i,
    );
    assert.match(s.accepted[0], /consultation\.ics/);
  } finally {
    await s.close();
  }
});
test("server without STARTTLS never receives credentials", async () => {
  const s = await server({ noTls: true });
  try {
    await assert.rejects(smtp.verify({ transportFactory: s.factory }));
    assert.equal(s.auth.length, 0);
    assert.equal(s.accepted.length, 0);
  } finally {
    await s.close();
  }
});
test("untrusted SMTP certificate is rejected before credentials are transmitted", async () => {
  const s = await server({ untrusted: true });
  try {
    await assert.rejects(smtp.verify({ transportFactory: s.factory }));
    assert.equal(s.auth.length, 0);
  } finally {
    await s.close();
  }
});
test("wrong fixture password fails SMTP authentication without sending a message", async () => {
  const s = await server();
  try {
    await assert.rejects(
      smtp.verify({
        transportFactory: s.factory,
        env: { ...process.env, SMTP_PASSWORD: "wrong-fixture-password" },
      }),
      (e) => e.code === "EAUTH",
    );
    assert.equal(s.accepted.length, 0);
    assert.equal(s.auth[0].secure, true);
  } finally {
    await s.close();
  }
});
test("notification adapter rejects unpaid, unconfirmed and event-less bookings before transport", async () => {
  let connected = 0;
  for (const patch of [
    { payment_status: "pending" },
    { paid_at: null },
    { booking_status: "paid_pending_calendar" },
    { calendar_event_id: null },
  ])
    await assert.rejects(
      notifications.send({ ...paid(), ...patch }, "customer_email", {
        transportFactory: () => {
          connected++;
        },
      }),
      (e) => e.code === "NOTIFICATION_NOT_READY",
    );
  assert.equal(connected, 0);
});
test("all email labels are localized, Arabic is RTL and internal details stay out of client mail", () => {
  for (const language of ["en", "ru", "ar"]) {
    const b = { ...paid(), language };
    const client = notifications.message(b, "customer_email"),
      company = notifications.message(b, "company_email");
    assert.match(client.html, new RegExp('lang="' + language + '"'));
    assert.match(
      client.html,
      new RegExp('dir="' + (language === "ar" ? "rtl" : "ltr") + '"'),
    );
    assert.ok(client.text.includes("Asia/Dubai"));
    assert.ok(!client.text.includes(b.task_description));
    assert.ok(!company.html.includes("<script>"));
    if (language !== "en") {
      assert.ok(!client.text.includes("Booking ID:"));
      assert.ok(!company.text.includes("Task description:"));
    }
  }
});
test("paid outbox sends through TLS only after settlement and retries one rejected recipient with stable Message-ID", async () => {
  let rejectCompany = true;
  const s = await server({
    reject: (data) =>
      rejectCompany && /\.company_email@bteglobal.ae>/.test(data),
  });
  try {
    let day = DateTime.now().setZone("Asia/Dubai").plus({ days: 3 });
    while (day.weekday > 5) day = day.plus({ days: 1 });
    const body = {
      service_id: "api-integration",
      duration_hours: 1,
      start_at: candidates(day.toISODate(), 1)[0].start,
      customer_name: "SMTP Fixture",
      customer_email: "projects@bteglobal.ae",
      customer_phone: "+971501234567",
      company_name: "",
      task_description: "Local SMTP protocol test only",
      language: "ru",
      terms_accepted: true,
    };
    const order = await createOrder(body, randomUUID(), { database });
    const adapters = {
      calendar: { createEvent: async () => "fixture-event" },
      notifications: {
        send: (b, kind, opts) =>
          notifications.send(b, kind, { ...opts, transportFactory: s.factory }),
      },
    };
    await work(database, adapters);
    assert.equal(s.accepted.length, 0);
    await confirmVerifiedPayment(
      {
        bookingId: order.id,
        paymentId: "fixture_" + order.id,
        amountMinor: order.amount_minor,
        currency: "USD",
      },
      database,
    );
    await work(database, adapters);
    assert.equal(s.accepted.length, 1);
    assert.equal(
      (await database.query("SELECT notification_sent_at FROM bookings"))
        .rows[0].notification_sent_at,
      null,
    );
    rejectCompany = false;
    await database.query(
      "UPDATE outbox SET available_at=now() WHERE completed_at IS NULL",
    );
    await work(database, adapters);
    await work(database, adapters);
    assert.equal(s.accepted.length, 2);
    const attempts = s.attempts.filter((x) =>
      /\.company_email@bteglobal.ae>/.test(x),
    );
    assert.equal(attempts.length, 2);
    const ids = attempts.map((x) => x.match(/Message-ID:\s*(<[^>]+>)/i)[1]);
    assert.equal(ids[0], ids[1]);
    assert.ok(
      (await database.query("SELECT notification_sent_at FROM bookings"))
        .rows[0].notification_sent_at,
    );
    assert.ok(s.auth.every((x) => x.secure));
  } finally {
    await s.close();
  }
});
test("private diagnostics are not booking confirmations and only target the agreed mailbox", () => {
  const { testMessage } = require("../lib/notifications/diagnostics");
  for (const lang of ["en", "ru", "ar"]) {
    const m = testMessage(lang);
    assert.equal(m.to, "projects@bteglobal.ae");
    assert.match(m.html, new RegExp('lang="' + lang + '"'));
    assert.ok(!m.text.includes("150"));
  }
});
test("SMTP diagnostics reject Production and unauthorized Preview requests before DB access", async () => {
  const names = ["VERCEL_ENV", "DATABASE_URL", "CRON_SECRET"];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  const handler = require("../api/consultations/smtp-check");
  const request = () => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { action: "verify" },
  });
  const response = () => ({
    setHeader() {},
    status(n) {
      this.code = n;
      return this;
    },
    json(b) {
      this.body = b;
    },
  });
  try {
    process.env.VERCEL_ENV = "production";
    let r = response();
    await handler(request(), r);
    assert.equal(r.code, 404);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL =
      "postgresql://fixture:fixture@127.0.0.1:5432/test";
    process.env.CRON_SECRET = "fixture-only-secret";
    r = response();
    await handler(request(), r);
    assert.equal(r.code, 401);
  } finally {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
    }
  }
});

test("missing SMTP_PASSWORD is reported without connecting or exposing credential values", async () => {
  const before = process.env.SMTP_PASSWORD;
  delete process.env.SMTP_PASSWORD;
  let connected = 0;
  try {
    const result = await require("../lib/notifications/diagnostics").check(
      "verify",
      "en",
      {
        transportFactory: () => {
          connected++;
        },
      },
    );
    assert.deepEqual(result.missing, ["SMTP_PASSWORD"]);
    assert.equal(result.authenticated, false);
    assert.equal(result.messageSent, false);
    assert.equal(connected, 0);
  } finally {
    process.env.SMTP_PASSWORD = before;
  }
});

test("private diagnostics return a sanitized authentication failure", async () => {
  const s = await server();
  try {
    const result = await require("../lib/notifications/diagnostics").check(
      "verify",
      "en",
      {
        transportFactory: s.factory,
        env: { ...process.env, SMTP_PASSWORD: "wrong-fixture-password" },
      },
    );
    assert.equal(result.error, "smtp_authentication_failed");
    assert.equal(result.authenticated, false);
    assert.equal(result.messageSent, false);
    assert.ok(!JSON.stringify(result).includes("fixture"));
  } finally {
    await s.close();
  }
});
