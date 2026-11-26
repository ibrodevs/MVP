const fs = require("node:fs/promises");
const path = require("node:path");
const assets = require("./public-assets");
async function build(output = path.resolve("public")) {
  // Only remove this script's generated output, never an arbitrary caller path.
  if (path.resolve(output) !== path.resolve("public"))
    throw Error("Invalid build output");
  await fs.rm(output, { recursive: true, force: true });
  for (const file of assets) {
    await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await fs.copyFile(file, path.join(output, file));
  }
  console.log(`Prepared ${assets.length} allowlisted public assets`);
}
if (require.main === module)
  build().catch(() => {
    console.error("Static build failed");
    process.exitCode = 1;
  });
module.exports = { build };
