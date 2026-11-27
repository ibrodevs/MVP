const { Pool } = require("pg");
const { migrationUrl, runMigrations } = require("../lib/booking/migrations");
(async () => {
  const pool = new Pool({
    connectionString: migrationUrl(),
    max: 1,
    connectionTimeoutMillis: 15000,
    statement_timeout: 60000,
  });
  try {
    const result = await runMigrations(pool);
    console.log(`Migrations complete: ${result.applied} applied`);
  } finally {
    await pool.end();
  }
})().catch(() => {
  console.error(
    "Migration failed; verify direct connection and migration state (credentials omitted)",
  );
  process.exitCode = 1;
});
