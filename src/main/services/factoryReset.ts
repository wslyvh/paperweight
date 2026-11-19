import { readdirSync, rmSync } from "node:fs";
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
  rmSync(app.getPath("logs"), { recursive: true, force: true });

  if (getActiveEmail()) wipeDatabase();
  wipeGlobalDatabase();

  const userData = app.getPath("userData");
  // Include orphaned account files, not just accounts still in the registry.
  const files = readdirSync(userData);
  for (const name of files) {
    if (/\.db(?:-wal|-shm)?$/.test(name)) {
      rmSync(join(userData, name), { force: true });
    }
  }
  // Delete credentials (including staging and license) only after every DB.
  for (const name of files) {
    if (name.endsWith(".enc")) rmSync(join(userData, name), { force: true });
  }
  // Keep the registry until account-file deletion succeeds, as before.
  for (const name of ["accounts.json", "settings.json"]) {
    rmSync(join(userData, name), { force: true });
  }
}
