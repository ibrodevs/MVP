const { route } = require("../../lib/booking/http");
const { availability } = require("../../lib/booking/availability");
module.exports = route("GET", async (req) => ({
  slots: await availability(req.query.date, Number(req.query.duration)),
}));
