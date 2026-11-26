const { createHash, timingSafeEqual } = require("node:crypto");
const { db } = require("./db");
const hash = (s) => createHash("sha256").update(s).digest("hex");
function fail(status, code, field) {
  throw Object.assign(Error(code), { status, code, field });
}
function authorize(req) {
  const expected = process.env.CRON_SECRET,
    received = req.headers.authorization || "";
  if (
    !expected ||
    Buffer.byteLength(received) !== Buffer.byteLength("Bearer " + expected) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from("Bearer " + expected))
  )
    fail(401, "unauthorized");
}
async function limit(req, scope, max = 60) {
  // Vercel overwrites x-real-ip. Local server uses socket address. Never trust arbitrary X-Forwarded-For.
  const ip = process.env.VERCEL
    ? req.headers["x-real-ip"]
    : req.socket?.remoteAddress;
  const key = hash(
    scope + ":" + (ip || "unknown") + ":" + Math.floor(Date.now() / 60000),
  );
  const { rows } = await db().query(
    "INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '2 minutes') ON CONFLICT(key) DO UPDATE SET hits=rate_limits.hits+1 RETURNING hits",
    [key],
  );
  if (rows[0].hits > max) fail(429, "rate_limited");
}
function allowedOrigins() {
  const origins = new Set([
    new URL(process.env.APP_BASE_URL || "http://localhost:3000").origin,
  ]);
  if (process.env.VERCEL_ENV === "preview")
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL])
      if (host) origins.add("https://" + host);
  return origins;
}
function route(
  method,
  fn,
  { rate = true, max = 60, cacheControl, guard } = {},
) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== method) {
        res.setHeader("Allow", method);
        fail(405, "method_not_allowed");
      }
      if (guard) await guard(req);
      if (method === "POST") {
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          fail(415, "invalid");
        const origin = req.headers.origin;
        if (origin && !allowedOrigins().has(origin)) fail(403, "forbidden");
        if (Number(req.headers["content-length"]) > 16384) fail(413, "invalid");
        if (typeof req.body === "string") {
          try {
            req.body = JSON.parse(req.body);
          } catch (e) {
            fail(400, "invalid");
          }
        }
        if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 16384)
          fail(413, "invalid");
      }
      if (typeof rate === "function") await rate(req);
      else if (rate) await limit(req, req.url?.split("?")[0] || method, max);
      const value = await fn(req);
      if (cacheControl) res.setHeader("Cache-Control", cacheControl);
      res.status(200).json(value);
    } catch (e) {
      const code =
        e.code === "23P01"
          ? "slot_unavailable"
          : e.code === "23505"
            ? "conflict"
            : e.code;
      const status =
        e.code === "23P01" || e.code === "23505" ? 409 : e.status || 503;
      if (status === 429) res.setHeader("Retry-After", "60");
      res.status(status).json({
        error: status >= 500 ? "unavailable" : code || "invalid",
        ...(e.field ? { field: e.field } : {}),
      });
    }
  };
}
module.exports = { route, fail, hash, authorize, limit };
