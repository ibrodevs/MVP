const { route } = require("../../lib/booking/http");
const { publicConfigLimit } = require("../../lib/booking/config-limit");
const { config } = require("../../lib/booking/config");
module.exports = route(
  "GET",
  async (req) => {
    const c = config();
    return {
      services: c.services,
      prices: c.prices,
      currency: c.currency,
      timezone: c.timezone,
      payment_available: c.paymentAvailable,
      demo: c.demo,
      schedule_ready: c.scheduleReady,
      horizon_days: c.horizonDays,
      reservation_minutes: c.ttlMinutes,
    };
  },
  {
    rate: publicConfigLimit,
    cacheControl: "public, max-age=0, s-maxage=30, stale-while-revalidate=30",
  },
);
