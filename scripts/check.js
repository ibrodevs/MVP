const fs = require("node:fs"),
  cp = require("node:child_process");
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((x) =>
      x.isDirectory() ? walk(dir + "/" + x.name) : [dir + "/" + x.name],
    );
}
for (const f of [
  "consultation.js",
  "consultation-i18n.js",
  "preferences.js",
  "legal.js",
  ...["api", "lib", "scripts", "tests"].flatMap(walk),
].filter((x) => x.endsWith(".js")))
  cp.execFileSync(process.execPath, ["--check", f]);
console.log("JavaScript syntax checks passed");
