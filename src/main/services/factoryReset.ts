import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getElectron } from "../electronRuntime";
import { stopAllSyncs } from "../sync-manager";
import { setDatabaseKey } from "../databaseEncryption";
import { wipeDatabase } from "../db";
import { wipeGlobalDatabase } from "../globalDb";
import { applyAutoLaunch } from "./settings";

export async function requestFactoryReset(): Promise<void> {
  const { app, session } = getElectron();
  await stopAllSyncs();
  if (!process.env.PAPERWEIGHT_SEED) applyAutoLaunch(false, false);

  // Let Chromium clear its own live session files instead of deleting locked
  // directories underneath it. Failures use the existing Settings error flow.
  await session.defaultSession.clearData();
  const logs = app.getPath("logs");
  if (existsSync(logs)) {
    for (const name of readdirSync(logs)) {
      rmSync(join(logs, name), { force: true });
    }
  }

  wipeDatabase();

  const userData = app.getPath("userData");
  // Include orphaned account files using emailToFileKey names, not Chromium DBs.
  const files = readdirSync(userData);
  for (const name of files) {
    if (/^(?:account_[a-f0-9]{64}|[a-z0-9._-]*_[a-f0-9]{6})\.db(?:-wal|-shm|-journal|\.encrypting(?:-journal|-wal|-shm)?)?$/.test(name)) {
      rmSync(join(userData, name), { force: true });
    }
  }
  wipeGlobalDatabase();
  for (const name of ["global.db-journal", "global.db.encrypting", "global.db.encrypting-journal", "global.db.encrypting-wal", "global.db.encrypting-shm"]) {
    rmSync(join(userData, name), { force: true });
  }
  // Delete credentials and the database key only after every personal DB.
  for (const name of files) {
    if (name.endsWith(".enc")) rmSync(join(userData, name), { force: true });
  }
  // Keep the registry until database and credential deletion succeeds.
  for (const name of ["accounts.json", "settings.json"]) {
    rmSync(join(userData, name), { force: true });
  }
  setDatabaseKey();
}
