const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const target = {
  team: "team_ec7Wn1RssSAqb0hu6dcUTYt7",
  project: "prj_zPPCHwMEEsMJsQx5yC8eIEWaUvvM",
  branch: "feature/book-consultation",
};
async function configure() {
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
    const r = await fetch("https://api.vercel.com" + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw Error("Vercel API HTTP " + r.status);
    return r.json();
  };
  const p = await api(`/v9/projects/${target.project}?teamId=${target.team}`);
  if (
    p.link?.org !== "ibrodevs" ||
    p.link?.repo !== "MVP" ||
    p.link?.productionBranch === target.branch
  )
    throw Error("Unexpected project");
  const before = await api(
    `/v9/projects/${target.project}/env?teamId=${target.team}`,
  );
  const fingerprint = (envs) =>
    JSON.stringify(
      envs
        .filter(
          (x) =>
            x.target?.includes("production") ||
            x.key.startsWith("GCP_") ||
            [
              "DATABASE_URL",
              "DATABASE_URL_UNPOOLED",
              "GOOGLE_CALENDAR_ID",
              "CALENDAR_MODE",
            ].includes(x.key),
        )
        .map((x) => ({
          id: x.id,
          key: x.key,
          updatedAt: x.updatedAt,
          value: x.value,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  const values = {
    SMTP_HOST: "smtp.ionos.com",
    SMTP_PORT: "587",
    SMTP_USER: "projects@bteglobal.ae",
    EMAIL_FROM: "projects@bteglobal.ae",
    BOOKING_NOTIFICATION_EMAIL: "projects@bteglobal.ae",
    EMAIL_MODE: "smtp",
  };
  await api(
    `/v10/projects/${target.project}/env?teamId=${target.team}&upsert=true`,
    Object.entries(values).map(([key, value]) => ({
      key,
      value,
      type: "plain",
      target: ["preview"],
      gitBranch: target.branch,
    })),
  );
  const after = await api(
    `/v9/projects/${target.project}/env?teamId=${target.team}`,
  );
  for (const [key, value] of Object.entries(values))
    if (
      !after.envs.some(
        (x) =>
          x.key === key &&
          x.value === value &&
          x.gitBranch === target.branch &&
          x.target?.includes("preview"),
      )
    )
      throw Error("SMTP variable verification failed");
  if (fingerprint(before.envs) !== fingerprint(after.envs))
    throw Error("Unrelated environment snapshot changed");
  const password = after.envs.find(
    (x) =>
      x.key === "SMTP_PASSWORD" &&
      x.gitBranch === target.branch &&
      x.target?.includes("preview"),
  );
  console.log({
    project: "ibroits-projects/mvp",
    target: "Preview",
    branch: target.branch,
    keys: Object.keys(values),
    passwordPresent: !!password,
    passwordType: password?.type,
    neonGoogleAndProductionUnchanged: true,
    secretValues: "omitted",
  });
}
if (require.main === module)
  configure().catch(() => {
    console.error("Preview SMTP configuration failed; details omitted");
    process.exitCode = 1;
  });
module.exports = { configure };
