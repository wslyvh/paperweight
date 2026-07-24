import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import Database from "better-sqlite3";
import { APP_CONFIG } from "@shared/config";
import { findPresetByHost } from "@shared/email-providers";
import {
  accountTag,
  emailToFileKey,
  listAccounts,
  loadCredentials,
  saveCredentials,
} from "./credentials";
import { appLog } from "./utils/log";

// db.ts imports migrateActionLog from this module and is deliberately kept free
// of heavy top-level imports (it lazy-requires electron itself). So we access
// electron lazily here too, keeping this module's load graph light.
function userDataDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  return app.getPath("userData");
}

/**
 * v0.2 — multi-account integration
 * Single-account layout (credentials.enc, paperweight.email.db) is no longer supported.
 * Also cleans up any __staging__.enc left behind by a crashed OAuth flow.
 */
function cleanupStaleFiles(): void {
  const userData = userDataDir();
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
  // Lazily imported: providers/smtp pulls in the full provider/sync graph
  // (which relies on build-time defines), and db.ts imports this module for
  // migrateActionLog — keeping this import out of module scope keeps db.ts light.
  const { testSmtpConnection } = await import("./providers/smtp");
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
 * v0.4 — all-mail scan. Providers now scan all mail (not just inbox), so existing accounts
 * re-sync to pick up archived/foldered messages. Idempotent per account via the
 * `migration:all-mail-scope` settings marker. Preserves vendors, action_log, whitelist,
 * settings and license — only message rows and sync cursors are touched. Runs before
 * initDb(), so each account DB is opened directly with no active connection.
 *
 *   - imap & microsoft: message IDs can't be reconciled across the scope change (IMAP UIDs
 *     change namespace INBOX → All Mail; Microsoft switches to immutable IDs, a different
 *     format than stored), so clear messages, reset cursors, zero denormalized vendor counts,
 *     and flag re-derivation of `unsubscribed` status from action_log on the next sync.
 *   - gmail: already all-mail with stable IDs; marker only.
 */
function migrateScanScopeAllMail(): void {
  const userData = userDataDir();

  for (const acc of listAccounts()) {
    const creds = loadCredentials(acc.email);
    if (!creds) continue;

    const dbPath = join(userData, `${emailToFileKey(acc.email)}.db`);
    if (!existsSync(dbPath)) continue;

    let db: Database.Database | undefined;
    try {
      db = new Database(dbPath);

      const done = db
        .prepare("SELECT 1 FROM settings WHERE key = 'migration:all-mail-scope'")
        .get();
      if (done) continue;

      if (creds.providerType === "imap" || creds.providerType === "microsoft") {
        db.exec(`
          DELETE FROM messages;
          UPDATE vendors SET message_count = 0, sender_count = 0;
          UPDATE sync_state SET
            last_sync_at = NULL, next_page_token = NULL, quick_sync_done_at = NULL,
            historical_cursor = NULL, historical_done = 0, sync_checkpoint = NULL
          WHERE id = 1;
          INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:reapply-unsub', '1');
        `);
      }
      // gmail: marker only — existing data already includes archived mail.

      db.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:all-mail-scope', '1')"
      ).run();
      appLog.info(
        `migrations: all-mail scope applied for [${accountTag(acc.email)}] (${creds.providerType})`
      );
    } catch (err) {
      appLog.warn(
        `migrations: all-mail scope failed for [${accountTag(acc.email)}]: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      db?.close();
    }
  }
}

/**
 * v0.5 — the switch release. `@paperweight/analysis` replaces the old classifier,
 * so every stored row needs re-deriving and every account needs one more full
 * pass over its mailbox (this time fetching bodies, which history never did).
 * Idempotent per account via the `migration:engine-switch` settings marker.
 * Runs before initDb(), so each account DB is opened directly with no active
 * connection.
 *
 * **Nothing is cleared.** Message IDs are stable for all three providers, so
 * resetting the sync cursors is enough to make the next sync behave like a fresh
 * install — quick window first, then the licensed walk back to the start — and
 * every re-visited row merges through insertMessageVendor's upsert. Vendors,
 * messages, action_log, gdpr_cases, whitelist, pii_findings, pii_suppressions,
 * settings and the license all survive untouched.
 *
 * `sync_checkpoint` is deliberately left alone: it is the removal-pass cursor
 * (Gmail's History API), unrelated to the add path, and re-baselining it would
 * throw away deletion tracking for no gain.
 *
 * `migration:reclassify` tells the next sync to run runReclassifyPass() before
 * it connects, converting the existing rows to the engine's vocabulary from
 * local data alone.
 */
export function applyEngineSwitch(d: Database.Database): boolean {
  const done = d
    .prepare("SELECT 1 FROM settings WHERE key = 'migration:engine-switch'")
    .get();
  if (done) return false;

  // One transaction: the cursor reset and the marker land together, so a crash
  // mid-migration can never leave an account reset but unmarked (which would
  // reset it again next launch) or marked but not reset.
  d.transaction(() => {
    d.exec(`
      UPDATE sync_state SET
        last_sync_at = NULL, next_page_token = NULL, quick_sync_done_at = NULL,
        historical_cursor = NULL, historical_done = 0
      WHERE id = 1;
      INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:reclassify', '1');
      INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:engine-switch', '1');
    `);
  })();

  return true;
}

function migrateEngineSwitch(): void {
  const userData = userDataDir();

  for (const acc of listAccounts()) {
    const dbPath = join(userData, `${emailToFileKey(acc.email)}.db`);
    if (!existsSync(dbPath)) continue;

    let db: Database.Database | undefined;
    try {
      db = new Database(dbPath);
      if (applyEngineSwitch(db)) {
        appLog.info(`migrations: engine switch applied for [${accountTag(acc.email)}]`);
      }
    } catch (err) {
      appLog.warn(
        `migrations: engine switch failed for [${accountTag(acc.email)}]: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      db?.close();
    }
  }
}

/**
 * Schema migration — adds GDPR case columns to action_log tables created before
 * gdpr_cases existed. CREATE TABLE IF NOT EXISTS skips existing tables, so new
 * columns need ALTER. Called from initSchema (not runMigrations) so it fires on
 * every DB open, including account switches via reconnectDb.
 */
export function migrateActionLog(d: Database.Database): void {
  const existing = new Set(
    (d.pragma("table_info(action_log)") as Array<{ name: string }>).map((c) => c.name)
  );
  const columns: Array<[string, string]> = [
    ["case_id", "case_id INTEGER REFERENCES gdpr_cases(id) ON DELETE CASCADE"],
    ["message_id", "message_id TEXT"],
    ["subject", "subject TEXT"],
    ["body", "body TEXT"],
  ];
  for (const [name, ddl] of columns) {
    if (!existing.has(name)) d.exec(`ALTER TABLE action_log ADD COLUMN ${ddl}`);
  }
  d.exec("CREATE INDEX IF NOT EXISTS idx_action_log_case ON action_log(case_id) WHERE case_id IS NOT NULL");
}

/** Schema migration — account_email on vendors (identity for data requests). */
export function migrateVendors(d: Database.Database): void {
  const vendorCols = new Set(
    (d.pragma("table_info(vendors)") as Array<{ name: string }>).map((c) => c.name),
  );
  if (!vendorCols.has("account_email")) {
    d.exec("ALTER TABLE vendors ADD COLUMN account_email TEXT");
  }
}

/**
 * Schema migration — PII body/analysis columns on messages. Additive: existing
 * rows have no stored body, so body_state defaults to 'missing' (the constant
 * default applies to every pre-existing row). body_text/analysis_version stay
 * NULL until a message is (re)synced with a body / analyzed.
 *
 * Rollback: purely additive and non-destructive — reverting the code leaves the
 * columns inert, or `ALTER TABLE messages DROP COLUMN {body_text,body_state,
 * analysis_version}` removes them (bundled SQLite supports DROP COLUMN).
 */
export function migrateMessages(d: Database.Database): void {
  const cols = new Set(
    (d.pragma("table_info(messages)") as Array<{ name: string }>).map((c) => c.name),
  );
  const additions: Array<[string, string]> = [
    ["body_text", "body_text TEXT"],
    ["body_state", "body_state TEXT NOT NULL DEFAULT 'missing'"],
    ["analysis_version", "analysis_version TEXT"],
  ];
  for (const [name, ddl] of additions) {
    if (!cols.has(name)) d.exec(`ALTER TABLE messages ADD COLUMN ${ddl}`);
  }
}

/** Schema migration — last_viewed_at on gdpr_cases, tracks unseen-reply state. */
export function migrateGdprCases(d: Database.Database): void {
  const caseCols = new Set(
    (d.pragma("table_info(gdpr_cases)") as Array<{ name: string }>).map((c) => c.name),
  );
  if (!caseCols.has("last_viewed_at")) {
    d.exec("ALTER TABLE gdpr_cases ADD COLUMN last_viewed_at INTEGER");
  }
}

/**
 * Run all migrations in order. Safe to call on every launch — each migration
 * is a no-op if there is nothing to do.
 */
export async function runMigrations(): Promise<void> {
  cleanupStaleFiles();
  await backfillSmtpFromPreset();
  migrateScanScopeAllMail();
  migrateEngineSwitch();
}
