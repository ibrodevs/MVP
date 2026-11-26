const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
// Real PostgreSQL engine, used only by isolated tests/local demo. Production uses pg.
async function testDatabase(path) {
  const p = new PGlite(path);
  for (const file of fs
    .readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await p.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  let tail = Promise.resolve();
  async function lock() {
    const before = tail;
    let unlock;
    tail = new Promise((r) => (unlock = r));
    await before;
    return unlock;
  }
  return {
    async query(sql, args) {
      const release = await lock();
      try {
        return await p.query(sql, args);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await lock();
      return { query: (s, a) => p.query(s, a), release };
    },
    end: () => p.close(),
  };
}
module.exports = { testDatabase };
