// Synthetic fixtures only. Runs in Electron before launching the tested app.
// Linux smoke tests use Chromium's basic backend; this is not an OS-keyring test.
const { app, safeStorage } = require("electron");
const { readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");

const profile = resolve(process.argv[2]);
app.setPath("userData", profile);
app.whenReady().then(async () => {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Fixture encryption unavailable");
  const files = process.argv.find((arg) => arg.startsWith("--file="));
  for (const file of files ? [files.slice(7)] : readdirSync(profile).filter((name) => name.endsWith(".enc"))) {
    const path = join(profile, file);
    const synthetic = JSON.stringify(JSON.parse(readFileSync(path, "utf8")));
    writeFileSync(path, await safeStorage.encryptStringAsync(synthetic));
  }
  if (process.argv.includes("--license")) {
    const data = JSON.stringify({ key: "MCP-SMOKE-TEST", tier: "test", validatedAt: Date.now() });
    writeFileSync(join(profile, "license.enc"), await safeStorage.encryptStringAsync(data));
  }
  app.quit();
}).catch(() => {
  console.error("Could not encrypt synthetic smoke fixture");
  app.exit(1);
});
