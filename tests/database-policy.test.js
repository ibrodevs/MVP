const { test } = require("node:test");
const assert = require("node:assert/strict");
const project = require("../lib/booking/neon-project.json");
const {
  isIsolatedDatabase,
  isMockDatabaseSafe,
  assertIsolatedDatabase,
} = require("../lib/booking/database-policy");
const { migrationUrl } = require("../lib/booking/migrations");
const fixture = (host) =>
  "postgresql://fixture:fixture@" + host + "/neondb?sslmode=verify-full";
test("both production endpoints are rejected by test and mock database policy", () => {
  for (const host of project.production.hosts) {
    const url = fixture(host);
    assert.equal(isMockDatabaseSafe(url), false);
    assert.throws(() => assertIsolatedDatabase(url));
  }
});
test("only dedicated Neon Preview endpoints and disposable local hosts are allowed for tests", () => {
  for (const host of [
    ...project.preview.hosts,
    "127.0.0.1:55439",
    "localhost:5432",
  ])
    assert.equal(isIsolatedDatabase(fixture(host)), true);
  assert.equal(isIsolatedDatabase(fixture("unknown.neon.tech")), false);
  assert.equal(isIsolatedDatabase(undefined), false);
  assert.equal(
    isIsolatedDatabase(
      fixture(project.preview.hosts[0]) + "&options=endpoint%3Dep-other",
    ),
    false,
  );
});
test("production Neon URL disables mock even in otherwise permitted Preview runtime", () => {
  const names = [
    "NODE_ENV",
    "VERCEL",
    "VERCEL_ENV",
    "PAYMENT_MODE",
    "DATABASE_URL",
  ];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      PAYMENT_MODE: "mock",
      DATABASE_URL: fixture(project.production.hosts[1]),
    });
    assert.equal(require("../lib/booking/config").config().mock, false);
    process.env.DATABASE_URL = fixture(project.preview.hosts[1]);
    assert.equal(require("../lib/booking/config").config().mock, true);
  } finally {
    for (const k of names) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
test("migration runner chooses direct URL and refuses a Neon pooler URL", () => {
  const direct = fixture(project.production.hosts[0]),
    pooled = fixture(project.production.hosts[1]);
  assert.equal(
    migrationUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct }),
    direct,
  );
  assert.throws(() => migrationUrl({ DATABASE_URL: pooled }));
  assert.throws(() => migrationUrl({ DATABASE_URL_UNPOOLED: pooled }));
});
test("approved default calendar is Mon-Fri 10-19 Dubai GMT+4", () => {
  const { config } = require("../lib/booking/config");
  const c = config();
  assert.equal(c.timezone, "Asia/Dubai");
  assert.deepEqual(c.days, [1, 2, 3, 4, 5]);
  assert.equal(c.start, "10:00");
  assert.equal(c.end, "19:00");
  const { DateTime } = require("luxon");
  const { candidates } = require("../lib/booking/availability");
  let day = DateTime.now().setZone(c.timezone).plus({ days: 3 });
  while (day.weekday > 5) day = day.plus({ days: 1 });
  const slots = candidates(day.toISODate(), 4);
  assert.equal(DateTime.fromISO(slots[0].start).setZone(c.timezone).hour, 10);
  assert.equal(DateTime.fromISO(slots.at(-1).end).setZone(c.timezone).hour, 19);
  assert.equal(
    DateTime.fromISO(slots[0].start).setZone(c.timezone).offset,
    240,
  );
});
