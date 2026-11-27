const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { parseEnv } = require("node:util");
const { randomBytes } = require("node:crypto");
const { assertIsolatedDatabase } = require("../lib/booking/database-policy");
const target = {
  teamId: "team_ec7Wn1RssSAqb0hu6dcUTYt7",
  projectId: "prj_zPPCHwMEEsMJsQx5yC8eIEWaUvvM",
  branch: "feature/book-consultation",
};
async function configure(apply = process.argv.includes("--apply")) {
  const env = parseEnv(fs.readFileSync(".env.preview.local", "utf8"));
  assertIsolatedDatabase(env.DATABASE_URL);
  if (!new URL(env.DATABASE_URL).hostname.includes("-pooler"))
    throw Error("Preview app requires the pooled URL");
  const authPath =
    process.platform === "darwin"
      ? path.join(
          os.homedir(),
          "Library/Application Support/com.vercel.cli/auth.json",
        )
      : path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json");
  const token =
    process.env.VERCEL_TOKEN ||
    JSON.parse(fs.readFileSync(authPath, "utf8")).token;
  const api = async (route, body) => {
    const response = await fetch("https://api.vercel.com" + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error("Vercel configuration request failed: " + response.status);
    return response.json();
  };
  const project = await api(
    `/v9/projects/${target.projectId}?teamId=${target.teamId}`,
  );
  if (
    project.name !== "mvp" ||
    project.link?.org !== "ibrodevs" ||
    project.link?.repo !== "MVP" ||
    project.link?.productionBranch === target.branch
  )
    throw Error("Unexpected Vercel target");
  const values = {};
  for (const key of [
    "DATABASE_URL",
    "GOOGLE_CALENDAR_ID",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "EMAIL_FROM",
    "BOOKING_NOTIFICATION_EMAIL",
    "BOOKING_TIMEZONE",
    "BOOKING_WORK_DAYS",
    "BOOKING_WORK_START",
    "BOOKING_WORK_END",
  ])
    if (env[key]) values[key] = env[key];
  Object.assign(values, {
    APP_BASE_URL:
      "https://mvp-git-feature-book-consultation-ibroits-projects.vercel.app",
    PAYMENT_MODE: "mock",
    CALENDAR_MODE: "mock",
    EMAIL_MODE: "mock",
    BOOKING_DEMO_SCHEDULE: "true",
  });
  if (!env.CRON_SECRET && apply) {
    env.CRON_SECRET = randomBytes(32).toString("base64url");
    fs.writeFileSync(
      ".env.preview.local",
      Object.entries(env)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    fs.chmodSync(".env.preview.local", 0o600);
  }
  if (env.CRON_SECRET) values.CRON_SECRET = env.CRON_SECRET;
  const records = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    type: ["DATABASE_URL", "CRON_SECRET"].includes(key) ? "sensitive" : "plain",
    target: ["preview"],
    gitBranch: target.branch,
  }));
  if (apply) {
    await api(
      `/v10/projects/${target.projectId}/env?teamId=${target.teamId}&upsert=true`,
      records,
    );
    const live = await api(
      `/v9/projects/${target.projectId}/env?teamId=${target.teamId}`,
    );
    for (const record of records)
      if (
        !live.envs?.some(
          (x) =>
            x.key === record.key &&
            x.gitBranch === target.branch &&
            x.target?.includes("preview"),
        )
      )
        throw Error("Preview variable verification failed");
    fs.mkdirSync(".vercel", { recursive: true });
    fs.writeFileSync(
      ".vercel/project.json",
      JSON.stringify(
        {
          projectId: target.projectId,
          orgId: target.teamId,
          projectName: "mvp",
        },
        null,
        2,
      ),
    );
  }
  console.log({
    applied: apply,
    target: "Preview only",
    branch: target.branch,
    keys: records.map((r) => r.key),
    productionChanged: false,
    values: "omitted",
  });
}
if (require.main === module)
  configure().catch((e) => {
    console.error(
      e.message.startsWith("Vercel configuration request failed")
        ? e.message
        : "Preview configuration failed (credentials omitted)",
    );
    process.exitCode = 1;
  });
module.exports = { configure };
