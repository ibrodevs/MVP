const { DateTime } = require("luxon");
const SERVICES = [
  "software-development",
  "api-integration",
  "data-engineering",
  "business-automation",
  "technology-consulting",
];
// Single source of prices. All amounts are integer USD cents.
const PRICES = Object.freeze({ 1: 15000, 2: 30000, 3: 45000, 4: 60000 });
function config() {
  const production =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";
  const mock =
    process.env.PAYMENT_MODE === "mock" &&
    !production &&
    (!process.env.VERCEL || process.env.VERCEL_ENV === "preview");
  const demo = mock && process.env.BOOKING_DEMO_SCHEDULE === "true";
  const number = (name, fallback, min, max) => {
    const n = Number(process.env[name] || fallback);
    if (!Number.isInteger(n) || n < min || n > max)
      throw Error("Invalid configuration: " + name);
    return n;
  };
  const timezone = process.env.BOOKING_TIMEZONE || "Asia/Almaty";
  if (!DateTime.now().setZone(timezone).isValid)
    throw Error("Invalid timezone");
  const days = (process.env.BOOKING_WORK_DAYS || (demo ? "1,2,3,4,5" : ""))
    .split(",")
    .filter(Boolean)
    .map(Number);
  const start = process.env.BOOKING_WORK_START || (demo ? "09:00" : "");
  const end = process.env.BOOKING_WORK_END || (demo ? "18:00" : "");
  const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const scheduleReady =
    days.length > 0 &&
    days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
    validTime(start) &&
    validTime(end) &&
    start < end;
  return {
    services: SERVICES,
    prices: PRICES,
    currency: "USD",
    timezone,
    mock,
    demo,
    paymentAvailable: mock,
    scheduleReady,
    days,
    start,
    end,
    slotMinutes: number("BOOKING_SLOT_MINUTES", 30, 5, 120),
    horizonDays: number("BOOKING_HORIZON_DAYS", 60, 1, 365),
    leadMinutes: number("BOOKING_MIN_LEAD_MINUTES", 120, 0, 43200),
    ttlMinutes: number("BOOKING_RESERVATION_TTL_MINUTES", 15, 1, 60),
    termsVersion: "2026-10-08",
    refundPolicyVersion: "2026-10-08",
  };
}
module.exports = { config, SERVICES, PRICES };
