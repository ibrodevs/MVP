const { getVercelOidcToken } = require("@vercel/oidc");
const scope = "https://www.googleapis.com/auth/calendar";
function configuration(env = process.env) {
  const names = [
    "GCP_PROJECT_NUMBER",
    "GCP_WORKLOAD_IDENTITY_POOL_ID",
    "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
    "GCP_SERVICE_ACCOUNT_EMAIL",
  ];
  if (!names.every((k) => env[k])) throw Error("WIF configuration incomplete");
  if (
    !/^\d+$/.test(env.GCP_PROJECT_NUMBER) ||
    ![
      env.GCP_WORKLOAD_IDENTITY_POOL_ID,
      env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    ].every((x) => /^[a-z0-9-]+$/.test(x)) ||
    !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(
      env.GCP_SERVICE_ACCOUNT_EMAIL,
    )
  )
    throw Error("WIF configuration invalid");
  return {
    audience: `//iam.googleapis.com/projects/${env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    serviceAccount: env.GCP_SERVICE_ACCOUNT_EMAIL,
    oidcAudience: env.GCP_AUDIENCE,
  };
}
async function exchange(
  signal,
  { env = process.env, oidc = getVercelOidcToken, request = fetch } = {},
) {
  const c = configuration(env);
  const subject = await oidc(
    c.oidcAudience ? { audience: c.oidcAudience } : undefined,
  );
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
  async function post(url, body, stage, authorization) {
    const response = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: "Bearer " + authorization } : {}),
      },
      body: JSON.stringify(body),
      signal: bounded,
    });
    if (!response.ok)
      throw Object.assign(Error("Calendar WIF authentication failed"), {
        code: "CALENDAR_WIF_FAILED",
        authStage: stage,
        calendarStatus: response.status,
      });
    return response.json();
  }
  const sts = await post(
    "https://sts.googleapis.com/v1/token",
    {
      audience: c.audience,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: subject,
    },
    "sts",
  );
  if (!sts.access_token) throw Error("Calendar WIF token missing");
  const sa = await post(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(c.serviceAccount)}:generateAccessToken`,
    { scope: [scope], lifetime: "3600s" },
    "impersonation",
    sts.access_token,
  );
  const expires = Date.parse(sa.expireTime);
  if (!sa.accessToken || !Number.isFinite(expires) || expires <= Date.now())
    throw Error("Calendar WIF token invalid");
  return { token: sa.accessToken, expires };
}
module.exports = { exchange, configuration };
