const { DateTime } = require("luxon");
const { config } = require("./config");
const { db, expire } = require("./db");
const calendar = require("../calendar");
function candidates(date, duration, c = config(), now = Date.now()) {
  if (typeof date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(date))
    throw Object.assign(Error("Invalid date"), {
      status: 400,
      code: "invalid",
    });
  const day = DateTime.fromISO(date, { zone: c.timezone });
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !day.isValid || !c.prices[duration])
    throw Object.assign(Error("Invalid date"), {
      status: 400,
      code: "invalid",
    });
  const today = DateTime.fromMillis(now, { zone: c.timezone }).startOf("day");
  if (!c.scheduleReady)
    throw Object.assign(Error("Schedule unavailable"), {
      status: 503,
      code: "schedule_unavailable",
    });
  if (
    day < today ||
    day > today.plus({ days: c.horizonDays }) ||
    !c.days.includes(day.weekday)
  )
    return [];
  const [sh, sm] = c.start.split(":").map(Number),
    [eh, em] = c.end.split(":").map(Number);
  const end = day.set({ hour: eh, minute: em });
  const result = [];
  for (
    let t = day.set({ hour: sh, minute: sm });
    t.plus({ hours: duration }) <= end;
    t = t.plus({ minutes: c.slotMinutes })
  ) {
    if (t.toMillis() >= now + c.leadMinutes * 60000)
      result.push({
        start: t.toUTC().toISO(),
        end: t.plus({ hours: duration }).toUTC().toISO(),
      });
  }
  return result;
}
function overlaps(a, b) {
  return (
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end)
  );
}
async function availability(
  date,
  duration,
  q = db(),
  c = config(),
  adapter = calendar,
) {
  const slots = candidates(date, duration, c);
  if (!slots.length) return [];
  const busy = await adapter.busy(slots[0].start, slots.at(-1).end);
  await expire(q);
  const { rows } = await q.query(
    "SELECT start_at AS start,end_at AS end FROM bookings WHERE slot_held AND booking_status IN ('pending_payment','paid_pending_calendar','confirmed','needs_attention') AND start_at<$2 AND end_at>$1",
    [slots[0].start, slots.at(-1).end],
  );
  return slots.filter(
    (s) =>
      ![
        ...busy,
        ...rows.map((r) => ({
          start: new Date(r.start).toISOString(),
          end: new Date(r.end).toISOString(),
        })),
      ].some((b) => overlaps(s, b)),
  );
}
module.exports = { candidates, overlaps, availability };
