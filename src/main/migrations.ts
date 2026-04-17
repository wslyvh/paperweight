import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import { app } from "electron";
import { APP_CONFIG } from "@shared/config";
import { findPresetByHost } from "@shared/email-providers";
import { accountTag, listAccounts, loadCredentials, saveCredentials } from "./credentials";
import { testSmtpConnection } from "./providers/smtp";
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
 * v0.3 — backfill SMTP settings on existing IMAP accounts.
 * Prior versions stored IMAP without SMTP; infer SMTP from the matching preset
 * (by IMAP host) and verify with a live connection test before persisting.
 * Hosts with no preset match, or where the test fails (e.g. a custom localhost
 * IMAP server colliding with the Proton preset on 127.0.0.1), are left alone
 * — the UI surfaces a banner so the user can reconfigure via Server Settings.
 */
async function backfillSmtpFromPreset(): Promise<void> {
  for (const acc of listAccounts()) {
    const creds = loadCredentials(acc.email);
    if (!creds?.imap || creds.imap.smtp) continue;

    const preset = findPresetByHost(creds.imap.host);
    if (!preset) continue;

    const testResult = await testSmtpConnection({
      host: preset.smtp.host,
      port: preset.smtp.port,
      tls: preset.smtp.tls,
      username: creds.imap.username,
      password: creds.imap.password,
      allowSelfSigned: creds.imap.allowSelfSigned,
    });

    if (!testResult.success) {
      appLog.warn(
        `migrations: SMTP test failed for [${accountTag(acc.email)}] with preset "${preset.id}": ${testResult.error} — leaving unconfigured`,
      );
      continue;
    }

    const updated = {
      ...creds,
      imap: { ...creds.imap, smtp: { ...preset.smtp } },
    };
    saveCredentials(updated, acc.email);
    appLog.info(`migrations: backfilled SMTP for [${accountTag(acc.email)}] from preset "${preset.id}"`);
  }
}

/**
 * Run all migrations in order. Safe to call on every launch — each migration
 * is a no-op if there is nothing to do.
 */
export async function runMigrations(): Promise<void> {
  cleanupStaleFiles();
  await backfillSmtpFromPreset();
}
