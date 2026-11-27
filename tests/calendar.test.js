const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, randomUUID } = require("node:crypto");
Object.assign(process.env, {
  NODE_ENV: "test",
  PAYMENT_MODE: "disabled",
  GOOGLE_CLIENT_EMAIL: "test@example.com",
  GOOGLE_CALENDAR_ID: "corporate",
  GOOGLE_PRIVATE_KEY: generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({ type: "pkcs8", format: "pem" }),
});
const calendar = require("../lib/calendar");
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
test("Google FreeBusy fails closed on per-calendar API errors", async () => {
  global.fetch = async (url) =>
    url.includes("oauth2")
      ? response({ access_token: "test", expires_in: 3600 })
      : response({
          calendars: { corporate: { errors: [{ reason: "notFound" }] } },
        });
  await assert.rejects(
    calendar.busy("2026-12-01T04:00:00Z", "2026-12-01T05:00:00Z"),
  );
});
test("Google event is private, includes paid internal record, has stable id and recovers retry", async () => {
  const booking = {
    id: randomUUID(),
    start_at: "2026-12-01T04:00:00Z",
    end_at: "2026-12-01T05:00:00Z",
    timezone: "Asia/Dubai",
    service_id: "software-development",
    duration_hours: 1,
    customer_name: "Test",
    customer_email: "private@example.com",
    customer_phone: "+123456789",
    task_description: "Private task",
    payment_status: "paid",
  };
  let stored = null,
    inserts = 0;
  global.fetch = async (url, options) => {
    if (url.includes("oauth2"))
      return response({ access_token: "test", expires_in: 3600 });
    if (url.endsWith("freeBusy"))
      return response({ calendars: { corporate: { busy: [] } } });
    if (options.method === "GET")
      return stored ? response(stored) : response({}, 404);
    stored = JSON.parse(options.body);
    inserts++;
    return response(stored);
  };
  const a = await calendar.createEvent(booking),
    b = await calendar.createEvent(booking);
  assert.equal(a, b);
  assert.equal(inserts, 1);
  assert.equal(stored.visibility, "private");
  assert.equal(stored.attendees, undefined);
  assert.ok(stored.description.includes("private@example.com"));
  assert.match(a, /^[a-v0-9]+$/);
});
test("external calendar conflict after payment prevents automatic event creation", async () => {
  let inserted = false;
  global.fetch = async (url, options) => {
    if (url.includes("oauth2"))
      return response({ access_token: "test", expires_in: 3600 });
    if (options.method === "GET") return response({}, 404);
    if (url.endsWith("freeBusy"))
      return response({
        calendars: {
          corporate: {
            busy: [
              { start: "2026-12-01T04:30:00Z", end: "2026-12-01T06:00:00Z" },
            ],
          },
        },
      });
    inserted = true;
    return response({});
  };
  await assert.rejects(
    calendar.createEvent({
      id: randomUUID(),
      start_at: "2026-12-01T04:00:00Z",
      end_at: "2026-12-01T05:00:00Z",
    }),
  );
  assert.equal(inserted, false);
});
