// electron-builder's mac.minimumSystemVersion only sets the app bundle minimum.
// electron-updater checks os.release(): macOS 13 is Darwin 22, not Darwin 13.
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const manifest = join(__dirname, "..", "dist", "latest-mac.yml");
const contents = readFileSync(manifest, "utf8");
if (/^minimumSystemVersion:/m.test(contents)) {
  throw new Error("Update manifest already defines minimumSystemVersion; review the builder output.");
}
writeFileSync(manifest, `${contents.trimEnd()}\nminimumSystemVersion: "22.0.0"\n`);
