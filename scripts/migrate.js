const fs = require("node:fs");
const { db } = require("../lib/booking/db");
(async () => {
  const p = db();
  try {
    for (const file of fs
      .readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await p.query(fs.readFileSync("db/migrations/" + file, "utf8"));
    console.log("Migration complete");
  } finally {
    await p.end();
  }
})().catch(() => {
  console.error("Migration failed; check database configuration");
  process.exitCode = 1;
});
