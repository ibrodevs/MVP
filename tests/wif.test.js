const { test } = require("node:test");
const assert = require("node:assert/strict");
const { exchange } = require("../lib/calendar/wif");
const env = {
  GCP_PROJECT_NUMBER: "12345",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "test-pool",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel",
  GCP_SERVICE_ACCOUNT_EMAIL: "test@test-project.iam.gserviceaccount.com",
};
test("WIF exchanges Vercel OIDC through STS then impersonates with Calendar scope only", async () => {
  const calls = [];
  const result = await exchange(undefined, {
    env,
    oidc: async () => "fixture-oidc",
    request: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () =>
          calls.length === 1
            ? { access_token: "fixture-sts" }
            : {
                accessToken: "fixture-calendar",
                expireTime: new Date(Date.now() + 3600000).toISOString(),
              },
      };
    },
  });
  assert.equal(result.token, "fixture-calendar");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].body.subjectToken, "fixture-oidc");
  assert.equal(
    calls[0].body.audience,
    "//iam.googleapis.com/projects/12345/locations/global/workloadIdentityPools/test-pool/providers/vercel",
  );
  assert.equal(calls[1].headers.Authorization, "Bearer fixture-sts");
  assert.deepEqual(calls[1].body.scope, [
    "https://www.googleapis.com/auth/calendar",
  ]);
});
test("WIF supports explicit provider audience and fails closed on STS rejection", async () => {
  let count = 0;
  await assert.rejects(
    exchange(undefined, {
      env: { ...env, GCP_AUDIENCE: "https://iam.googleapis.com/provider" },
      oidc: async (options) => {
        assert.equal(options.audience, "https://iam.googleapis.com/provider");
        return "fixture";
      },
      request: async () => {
        count++;
        return { ok: false, status: 400 };
      },
    }),
    (e) =>
      e.code === "CALENDAR_WIF_FAILED" &&
      e.authStage === "sts" &&
      !e.message.includes("fixture"),
  );
  assert.equal(count, 1);
});
test("WIF impersonation denial never falls back to a service-account private key", async () => {
  let count = 0;
  await assert.rejects(
    exchange(undefined, {
      env,
      oidc: async () => "fixture",
      request: async () =>
        ++count === 1
          ? { ok: true, json: async () => ({ access_token: "fixture-sts" }) }
          : { ok: false, status: 403 },
    }),
    (e) => e.authStage === "impersonation" && e.calendarStatus === 403,
  );
  assert.equal(count, 2);
});
test("partial WIF configuration is rejected before acquiring credentials", async () => {
  await assert.rejects(
    exchange(undefined, {
      env: { GCP_PROJECT_NUMBER: "123" },
      oidc: async () => {
        throw Error("must not call");
      },
    }),
    /configuration incomplete/,
  );
});
test("private Calendar diagnostics deny Production and unauthorized Preview before DB access", async () => {
  const handler = require("../api/consultations/calendar-check");
  const old = { ...process.env };
  async function call() {
    let status, body;
    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { action: "verify", date: "2026-12-01" },
      },
      {
        setHeader() {},
        status(s) {
          status = s;
          return this;
        },
        json(b) {
          body = b;
        },
      },
    );
    return { status, body };
  }
  try {
    process.env.VERCEL_ENV = "production";
    assert.equal((await call()).status, 404);
    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL_TARGET_ENV;
    const info = require("../lib/booking/neon-project.json");
    // Local disposable database is allowed by the same isolation policy.
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    process.env.CRON_SECRET = "fixture-secret";
    assert.equal((await call()).status, 401);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
});
