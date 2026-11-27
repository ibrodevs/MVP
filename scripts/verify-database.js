const { Pool } = require("pg");
(async () => {
  const url = new URL(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const tables = (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN('bookings','outbox','rate_limits') ORDER BY tablename",
      )
    ).rows.map((x) => x.tablename);
    if (tables.length !== 3) throw Error("Required tables missing");
    const counts = (
      await client.query(
        "SELECT (SELECT count(*)::int FROM public.bookings) bookings,(SELECT count(*)::int FROM public.outbox) outbox,(SELECT count(*)::int FROM public.rate_limits) rate_limits",
      )
    ).rows[0];
    const migrations = (
      await client.query(
        "SELECT name FROM public.booking_migrations ORDER BY name",
      )
    ).rows.map((x) => x.name);
    console.log({
      connection: "verified",
      pooled: url.hostname.includes("-pooler"),
      tables,
      counts,
      migrations,
      credentials: "omitted",
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
})().catch(() => {
  console.error("Database verification failed (credentials omitted)");
  process.exitCode = 1;
});
