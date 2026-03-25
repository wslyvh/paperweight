import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import { app } from "electron";
import { APP_CONFIG } from "@shared/config";
import { appLog } from "./utils/log";

/**
 * v0.2 — multi-account integration
 * Single-account layout (credentials.enc, paperweight.email.db) is no longer supported.
 * Remove legacy files so they don't linger in userData.
 */
function cleanupV01LegacyFiles(): void {
  const userData = app.getPath("userData");
  const legacy = [
    `${APP_CONFIG.DOMAIN}.db`,
    `${APP_CONFIG.DOMAIN}.db-wal`,
    `${APP_CONFIG.DOMAIN}.db-shm`,
    "credentials.enc",
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
  cleanupV01LegacyFiles();
}
