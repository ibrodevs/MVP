const { route, authorize, fail } = require("../../lib/booking/http");
const { isIsolatedDatabase } = require("../../lib/booking/database-policy");
const { db } = require("../../lib/booking/db");
const calendar = require("../../lib/calendar");
module.exports = route(
  "POST",
  async (req) => {
    const { action, date, bookingId } = req.body || {};
    try {
      if (action === "verify" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const start = new Date(date + "T06:00:00Z"),
          end = new Date(date + "T15:00:00Z");
        if (!Number.isFinite(+start)) fail(400, "invalid");
        const busy = await calendar.busy(
          start.toISOString(),
          end.toISOString(),
        );
        return {
          authenticated: true,
          mode: process.env.GCP_WORKLOAD_IDENTITY_POOL_ID ? "wif" : "key",
          freeBusyRead: true,
          busyCount: busy.length,
        };
      }
      if (action === "cleanup" && /^[0-9a-f-]{36}$/i.test(bookingId)) {
        const { rows } = await db().query(
          "SELECT * FROM bookings WHERE id=$1",
          [bookingId],
        );
        if (!rows[0]) fail(404, "not_found");
        return calendar.cleanupPreviewEvent(rows[0]);
      }
      fail(400, "invalid");
    } catch (e) {
      if (e.status) throw e;
      return {
        authenticated: false,
        error:
          e.code === "CALENDAR_WIF_FAILED"
            ? "calendar_wif_failed"
            : "calendar_check_failed",
        ...(e.authStage ? { stage: e.authStage } : {}),
        ...(e.calendarStatus ? { upstreamStatus: e.calendarStatus } : {}),
      };
    }
  },
  {
    guard(req) {
      if (
        process.env.VERCEL_ENV !== "preview" ||
        process.env.VERCEL_TARGET_ENV === "production" ||
        !isIsolatedDatabase(process.env.DATABASE_URL)
      )
        fail(404, "not_found");
      authorize(req);
    },
    max: 6,
  },
);
