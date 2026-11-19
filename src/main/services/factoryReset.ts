import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getElectron } from "../electronRuntime";
import { stopAllSyncs } from "../sync-manager";
import { getActiveEmail } from "../credentials";
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

  if (getActiveEmail()) wipeDatabase();

  const userData = app.getPath("userData");
  // Include orphaned account files using emailToFileKey names, not Chromium DBs.
  const files = readdirSync(userData);
  for (const name of files) {
    if (/^[a-z0-9._-]*_[a-f0-9]{6}\.db(?:-wal|-shm)?$/.test(name)) {
      rmSync(join(userData, name), { force: true });
    }
  }
  // Delete credentials (including staging and license) only after every DB.
  for (const name of files) {
    if (name.endsWith(".enc")) rmSync(join(userData, name), { force: true });
  }
  // Keep global state and the registry until account-file deletion succeeds.
  for (const name of ["accounts.json", "settings.json"]) {
    rmSync(join(userData, name), { force: true });
  }
  wipeGlobalDatabase();
}
