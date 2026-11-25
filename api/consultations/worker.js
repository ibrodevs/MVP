const { route, authorize } = require("../../lib/booking/http");
const { work } = require("../../lib/booking/worker");
module.exports = route(
  "GET",
  async (req) => {
    authorize(req);
    return work();
  },
  { rate: false },
);
