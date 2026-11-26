const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}
const request = () => ({
  method: "GET",
  headers: {},
  url: "/api/consultations/config",
  socket: { remoteAddress: randomUUID() },
});
test("public configuration returns prices without DATABASE_URL or PostgreSQL calls", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const res = response();
  await require("../api/consultations/config")(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.prices[4], 60000);
  assert.match(res.headers["Cache-Control"], /s-maxage=30/);
  assert.equal(JSON.stringify(res.body).includes("DATABASE_URL"), false);
  if (previous) process.env.DATABASE_URL = previous;
});
test("config limiter returns 429 without PostgreSQL and bounds abusive clients", async () => {
  const req = request();
  let last;
  for (let i = 0; i < 121; i++) {
    last = response();
    await require("../api/consultations/config")(req, last);
  }
  assert.equal(last.statusCode, 429);
  assert.equal(last.body.error, "rate_limited");
  assert.equal(last.headers["Cache-Control"], "no-store");
});
test("optional Redis protection is shared and fails closed without consulting PostgreSQL", async () => {
  const original = global.fetch;
  process.env.CONFIG_RATE_LIMIT_REDIS_REST_URL = "https://redis.example";
  process.env.CONFIG_RATE_LIMIT_REDIS_REST_TOKEN = "test-only";
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ result: 121 }),
    });
    let res = response();
    await require("../api/consultations/config")(request(), res);
    assert.equal(res.statusCode, 429);
    global.fetch = async () => {
      throw Error("redis down");
    };
    res = response();
    await require("../api/consultations/config")(request(), res);
    assert.equal(res.statusCode, 503);
  } finally {
    global.fetch = original;
    delete process.env.CONFIG_RATE_LIMIT_REDIS_REST_URL;
    delete process.env.CONFIG_RATE_LIMIT_REDIS_REST_TOKEN;
  }
});
test("Preview with NODE_ENV production allows explicit mock; all production/unknown Vercel targets deny it", () => {
  const names = [
    "NODE_ENV",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_TARGET_ENV",
    "PAYMENT_MODE",
  ];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  const { config } = require("../lib/booking/config");
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      PAYMENT_MODE: "mock",
    });
    delete process.env.VERCEL_TARGET_ENV;
    assert.equal(config().mock, true);
    for (const target of ["production", "development", ""]) {
      process.env.VERCEL_ENV = target;
      assert.equal(config().mock, false);
    }
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_TARGET_ENV = "production";
    assert.equal(config().mock, false);
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_TARGET_ENV;
    assert.equal(config().mock, false);
  } finally {
    for (const k of names) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
test("static build publishes only the explicit asset allowlist", async () => {
  await require("../scripts/build").build();
  const assets = require("../scripts/public-assets");
  for (const asset of assets) assert.ok(fs.existsSync("public/" + asset));
  for (const forbidden of [
    "lib",
    "api",
    "db",
    "docs",
    "scripts",
    "tests",
    ".env.example",
    "package.json",
    "vercel.json",
  ])
    assert.equal(fs.existsSync("public/" + forbidden), false);
  assert.equal(
    JSON.parse(fs.readFileSync("vercel.json")).outputDirectory,
    "public",
  );
});

test("Production mock endpoint rejects before any database access", async () => {
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
      VERCEL_ENV: "production",
      PAYMENT_MODE: "mock",
    });
    delete process.env.DATABASE_URL;
    const res = response();
    await require("../api/consultations/mock-payment")(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { id: randomUUID() },
        url: "/api/consultations/mock-payment",
      },
      res,
    );
    assert.equal(res.statusCode, 404);
  } finally {
    for (const k of names) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
