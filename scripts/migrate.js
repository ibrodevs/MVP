const fs = require("node:fs");
const { db } = require("../lib/booking/db");
(async () => {
  const p = db();
  try {
    await p.query(fs.readFileSync("db/migrations/001_booking.sql", "utf8"));
    console.log("Migration complete");
  } finally {
    await p.end();
  }
})().catch(() => {
  console.error("Migration failed; check database configuration");
  process.exitCode = 1;
});
