const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
function migrationUrl(env = process.env) {
  const value = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!value) throw Error("Direct database connection is missing");
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech") && url.hostname.includes("-pooler."))
    throw Error("Migrations require DATABASE_URL_UNPOOLED");
  return value;
}
async function runMigrations(pool) {
  const client = await pool.connect();
  let applied = 0;
  try {
    await client.query("SELECT pg_advisory_lock(702151)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS booking_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of fs
      .readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const contents = fs.readFileSync(
        path.join("db/migrations", name),
        "utf8",
      );
      const checksum = createHash("sha256").update(contents).digest("hex");
      const existing = (
        await client.query(
          "SELECT checksum FROM booking_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (existing) {
        if (existing.checksum !== checksum)
          throw Error("Applied migration checksum changed");
        continue;
      }
      // Legacy migration 002 carries its own BEGIN/COMMIT; the runner now owns the
      // transaction so schema changes and the migration record commit together.
      const sql = contents
        .replace(/^\s*BEGIN;\s*/i, "")
        .replace(/\s*COMMIT;\s*$/i, "");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO booking_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        applied++;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    return { applied };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(702151)");
    } finally {
      client.release();
    }
  }
}
module.exports = { migrationUrl, runMigrations };
