const project = require("./neon-project.json");
function isIsolatedDatabase(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    if (!["postgres:", "postgresql:"].includes(u.protocol)) return false;
    // Never allow an endpoint-routing override to evade the host allowlist.
    if (/endpoint\s*=/i.test(u.searchParams.get("options") || "")) return false;
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return true;
    return project.preview.hosts.includes(u.hostname);
  } catch {
    return false;
  }
}
function isMockDatabaseSafe(value) {
  // No URL is valid for the in-memory local demo / a read-only config response.
  // The order API still requires a DB. A production or unknown remote URL is denied.
  return !value || isIsolatedDatabase(value);
}
function assertIsolatedDatabase(value) {
  if (!isIsolatedDatabase(value))
    throw Error(
      "Tests require an allowlisted Preview branch or disposable local database",
    );
}
module.exports = {
  isIsolatedDatabase,
  isMockDatabaseSafe,
  assertIsolatedDatabase,
};
