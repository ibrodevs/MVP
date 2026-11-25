const { createSign } = require("node:crypto");
const { config } = require("../booking/config");
let cached;
function mock() {
  return config().mock && process.env.CALENDAR_MODE === "mock";
}
async function token() {
  if (cached && cached.expires > Date.now() + 60000) return cached.token;
  const email = process.env.GOOGLE_CLIENT_EMAIL,
    key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key || !process.env.GOOGLE_CALENDAR_ID)
    throw Error("Calendar not configured");
  const now = Math.floor(Date.now() / 1000),
    enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned =
    enc({ alg: "RS256", typ: "JWT" }) +
    "." +
    enc({
      iss: email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const assertion =
    unsigned +
    "." +
    createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw Error("Calendar authentication failed");
  const b = await r.json();
  cached = { token: b.access_token, expires: Date.now() + b.expires_in * 1000 };
  return cached.token;
}
async function request(path, body, method = "POST") {
  const r = await fetch("https://www.googleapis.com/calendar/v3/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + (await token()),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 409) return { duplicate: true };
  if (!r.ok)
    throw Object.assign(Error("Calendar request failed"), {
      calendarStatus: r.status,
    });
  return r.json();
}
async function busy(start, end) {
  if (mock()) return [];
  const id = process.env.GOOGLE_CALENDAR_ID;
  const b = await request("freeBusy", {
    timeMin: start,
    timeMax: end,
    items: [{ id }],
  });
  if (!b.calendars?.[id] || b.calendars[id].errors?.length)
    throw Error("Calendar unavailable");
  return b.calendars[id].busy;
}
async function createEvent(b) {
  const id = "bte" + b.id.replace(/-/g, "");
  if (mock()) return id;
  // Private internal event: never add the customer as attendee to this event.
  // Customer receives a separate sanitized ICS invitation through the paid-email outbox.
  const path =
    "calendars/" +
    encodeURIComponent(process.env.GOOGLE_CALENDAR_ID) +
    "/events";
  // Recover a previously inserted event before FreeBusy: it would include our own event.
  try {
    const existing = await request(path + "/" + id, null, "GET");
    if (
      existing.id === id &&
      Date.parse(existing.start?.dateTime) === new Date(b.start_at).getTime() &&
      Date.parse(existing.end?.dateTime) === new Date(b.end_at).getTime()
    )
      return id;
    throw Error("Calendar event conflict");
  } catch (e) {
    if (e.calendarStatus !== 404) throw e;
  }
  const occupied = await busy(
    new Date(b.start_at).toISOString(),
    new Date(b.end_at).toISOString(),
  );
  if (
    occupied.some(
      (x) =>
        Date.parse(x.start) < new Date(b.end_at).getTime() &&
        Date.parse(x.end) > new Date(b.start_at).getTime(),
    )
  )
    throw Error("Calendar interval changed");
  const payload = {
    id,
    summary: "BTE consultation · " + b.service_id,
    visibility: "private",
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    start: {
      dateTime: new Date(b.start_at).toISOString(),
      timeZone: b.timezone,
    },
    end: { dateTime: new Date(b.end_at).toISOString(), timeZone: b.timezone },
    description: JSON.stringify({
      booking_id: b.id,
      service: b.service_id,
      duration: b.duration_hours,
      name: b.customer_name,
      email: b.customer_email,
      phone: b.customer_phone,
      company: b.company_name,
      task: b.task_description,
      payment_status: b.payment_status,
    }),
  };
  const result = await request(path + "?sendUpdates=none", payload);
  if (result.duplicate) {
    const existing = await request(path + "/" + id, null, "GET");
    if (existing.id !== id) throw Error("Calendar event conflict");
  }
  return id;
}
module.exports = { busy, createEvent };
