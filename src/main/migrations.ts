import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import { app } from "electron";
import { APP_CONFIG } from "@shared/config";
import { appLog } from "./utils/log";

/**
 * v0.2 — multi-account integration
 * Single-account layout (credentials.enc, paperweight.email.db) is no longer supported.
 * Also cleans up any __staging__.enc left behind by a crashed OAuth flow.
 */
function cleanupStaleFiles(): void {
  const userData = app.getPath("userData");
  const legacy = [
    `${APP_CONFIG.DOMAIN}.db`,
    `${APP_CONFIG.DOMAIN}.db-wal`,
    `${APP_CONFIG.DOMAIN}.db-shm`,
    "credentials.enc",
    "__staging__.enc",
  ];
  for (const name of legacy) {
    const p = join(userData, name);
    if (existsSync(p)) {
      try {
        unlinkSync(p);
        appLog.info(`migrations: removed legacy file ${name}`);
      } catch {
        appLog.warn(`migrations: could not remove legacy file ${name}`);
      }
    }
  }
}

/**
 * Run all migrations in order. Safe to call on every launch — each migration
 * is a no-op if there is nothing to do.
 */
export function runMigrations(): void {
  cleanupStaleFiles();
}
