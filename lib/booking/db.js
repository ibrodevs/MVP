const { Pool } = require("pg");
let pool;
function useTestDatabase(value) {
  if (process.env.NODE_ENV !== "test" || process.env.VERCEL)
    throw Error("Test database forbidden");
  pool = value;
}
function db() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL)
    throw Object.assign(Error("Database unavailable"), {
      status: 503,
      code: "unavailable",
    });
  return (pool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  }));
}
async function transaction(fn, database = db()) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
async function expire(q) {
  await q.query(
    "UPDATE bookings SET booking_status='expired',updated_at=now() WHERE booking_status='pending_payment' AND reservation_expires_at<=now()",
  );
}
module.exports = { db, transaction, expire, useTestDatabase };
