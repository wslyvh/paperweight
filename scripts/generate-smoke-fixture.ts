/**
 * Populate a userData directory with a minimal registered account for smoke tests.
 * Run via: cross-env ELECTRON_RUN_AS_NODE=1 electron --import tsx scripts/generate-smoke-fixture.ts <userDataDir>
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { initSchema } from "../src/main/db";
import { emailToFileKey } from "../src/main/credentials";

export const SMOKE_TEST_EMAIL = "smoke-test@paperweight.test";

const userDataDir = process.argv[2];
const replace = process.argv.includes("--replace");

if (!userDataDir) {
  console.error("Usage: electron --import tsx scripts/generate-smoke-fixture.ts <userDataDir> [--replace]");
  process.exit(1);
}

if (replace) {
  rmSync(userDataDir, { recursive: true, force: true });
}

const registeredAt = Date.now();
const fileKey = emailToFileKey(SMOKE_TEST_EMAIL);

mkdirSync(userDataDir, { recursive: true });

writeFileSync(
  join(userDataDir, "settings.json"),
  JSON.stringify(
    {
      activeAccount: SMOKE_TEST_EMAIL,
      autoLaunch: false,
      launchMinimized: false,
      colorTheme: "dim",
    },
    null,
    2,
  ),
  "utf-8",
);

writeFileSync(
  join(userDataDir, "accounts.json"),
  JSON.stringify(
    {
      accounts: [{ email: SMOKE_TEST_EMAIL, providerType: "imap", registeredAt }],
    },
    null,
    2,
  ),
  "utf-8",
);

const dbPath = join(userDataDir, `${fileKey}.db`);
const database = new Database(dbPath);
initSchema(database);
database.close();

// Synthetic input only: encrypt-smoke-fixture.cjs encrypts this before app startup.
writeFileSync(
  join(userDataDir, `${fileKey}.enc`),
  JSON.stringify({
    providerType: "imap",
    imap: {
      host: "imap.smoke.test",
      port: 993,
      tls: true,
      username: SMOKE_TEST_EMAIL,
      password: "smoke-fixture-not-real",
    },
  }),
  "utf-8",
);

const appVersion = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")).version as string;

writeFileSync(
  join(userDataDir, "manifest.json"),
  JSON.stringify(
    {
      appVersion,
      credentialFormat: "plain-text",
      email: SMOKE_TEST_EMAIL,
      fileKey,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  "utf-8",
);

console.info(`Smoke fixture ready in ${userDataDir} [${fileKey}]`);
