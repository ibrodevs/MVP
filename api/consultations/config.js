const { route } = require("../../lib/booking/http");
const { config } = require("../../lib/booking/config");
module.exports = route(
  "GET",
  async () => {
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
  { max: 120 },
);
