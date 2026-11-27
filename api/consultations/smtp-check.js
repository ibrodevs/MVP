const { route, authorize, fail } = require("../../lib/booking/http");
const { isIsolatedDatabase } = require("../../lib/booking/database-policy");
const { check } = require("../../lib/notifications/diagnostics");
function guard(req) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_TARGET_ENV === "production" ||
    !isIsolatedDatabase(process.env.DATABASE_URL)
  )
    fail(404, "not_found");
  authorize(req);
}
module.exports = route(
  "POST",
  async (req) => {
    const { action, language = "en" } = req.body || {};
    if (
      !["verify", "send"].includes(action) ||
      !["en", "ru", "ar"].includes(language)
    )
      fail(400, "invalid");
    return check(action, language);
  },
  { guard, max: 3 },
);
