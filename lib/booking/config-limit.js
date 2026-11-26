const { createHash } = require("node:crypto");
// Public, read-only configuration must survive a PostgreSQL outage. Keep this
// limiter isolated from db(). Redis is optional distributed protection; a bounded
// instance limiter plus CDN caching remain available without external services.
const buckets = new Map();
function keyFor(req, now) {
  const ip = process.env.VERCEL
    ? req.headers["x-real-ip"]
    : req.socket?.remoteAddress;
  return createHash("sha256")
    .update("config:" + (ip || "unknown") + ":" + Math.floor(now / 60000))
    .digest("hex");
}
async function publicConfigLimit(req) {
  const now = Date.now(),
    key = keyFor(req, now);
  const redisUrl = process.env.CONFIG_RATE_LIMIT_REDIS_REST_URL;
  const redisToken = process.env.CONFIG_RATE_LIMIT_REDIS_REST_TOKEN;
  if (redisUrl || redisToken) {
    if (!redisUrl || !redisToken || !redisUrl.startsWith("https://"))
      throw Object.assign(Error("Rate limit unavailable"), { status: 503 });
    const response = await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + redisToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        "EVAL",
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n",
        "1",
        "bte:config:" + key,
      ]),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok)
      throw Object.assign(Error("Rate limit unavailable"), { status: 503 });
    const body = await response.json();
    if (!Number.isInteger(body.result))
      throw Object.assign(Error("Rate limit unavailable"), { status: 503 });
    if (body.result > 120)
      throw Object.assign(Error("rate_limited"), {
        status: 429,
        code: "rate_limited",
      });
    return;
  }
  for (const [id, b] of buckets) if (b.expires <= now) buckets.delete(id);
  // Bound memory even with spoofed/rotating IPs; never evict live counters to let
  // an attacker reset its bucket. Other instances have independent counters.
  if (!buckets.has(key) && buckets.size >= 2048)
    throw Object.assign(Error("rate_limited"), {
      status: 429,
      code: "rate_limited",
    });
  const b = buckets.get(key) || { hits: 0, expires: now + 120000 };
  b.hits++;
  buckets.set(key, b);
  if (b.hits > 120)
    throw Object.assign(Error("rate_limited"), {
      status: 429,
      code: "rate_limited",
    });
}
module.exports = { publicConfigLimit };
