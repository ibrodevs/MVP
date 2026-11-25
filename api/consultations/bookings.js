const { route } = require("../../lib/booking/http");
const { createOrder } = require("../../lib/booking/orders");
module.exports = route(
  "POST",
  (req) => createOrder(req.body, req.headers["idempotency-key"]),
  { max: 6 },
);
