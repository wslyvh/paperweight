// The synthetic seed now needs the same OS key access as the desktop app.
const { app } = require("electron");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { mkdirSync, readFileSync } = require("node:fs");
const scriptIndex = process.argv.findIndex((argument) => resolve(argument) === __filename);
const profile = resolve(process.argv[scriptIndex + 1] ?? join(tmpdir(), "paperweight-local"));
mkdirSync(profile, { recursive: true });
app.setName(require("../package.json").name);
app.setPath("userData", profile);

app.whenReady().then(async () => {
  require("tsx/cjs");
  const { initializeDatabaseEncryption } = require("../src/main/databaseEncryption.ts");
  const { migrateAccountRegistry, migrateAccountFilenames } = require("../src/main/credentials.ts");
  await initializeDatabaseEncryption(profile);
  migrateAccountRegistry();
  migrateAccountFilenames();
  process.argv = [process.execPath, __filename, profile];
  const { syntheticCredentialsPath } = require("./seed-test-account.ts");
  const { writeSecureFile } = require("../src/main/secureStorage.ts");
  await writeSecureFile(syntheticCredentialsPath, JSON.parse(readFileSync(syntheticCredentialsPath, "utf8")));
  app.quit();
}).catch(() => {
  console.error("Could not seed the synthetic profile. Check secure storage.");
  app.exit(1);
});
