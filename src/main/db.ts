import { getElectron } from "./electronRuntime";
// INVARIANT: keep this module's top-level import graph light. db.ts is loaded
// very early and by nearly everything, including during the account-connect DB
// handling (temp DB → deterministic per-account DB swap). Do NOT add top-level
// imports of electron or other heavy/main-only modules — access them lazily via
// require() inside functions (see getCompaniesDbPath below). Anything imported
// here (e.g. ./migrations for migrateActionLog) must itself keep its top-level
// graph light for the same reason.
import type Database from "better-sqlite3";
import { openDatabase, attachDatabase, getDatabaseKey } from "./databaseEncryption";
import { join, basename, dirname } from "path";
import { existsSync, unlinkSync } from "fs";
import { dbLog } from "./utils/log";
import { emailToFileKey } from "./credentials";
import { attachGlobalDb, configureGlobalDbPath } from "./globalDb";
import {
  migrateActionLog,
  migrateGdprCases,
  migrateMessages,
  migrateQueryIndexes,
  migrateSyncState,
  migrateVendors,
} from "./migrations";

let db: Database.Database | undefined;

let _dbPath: string | undefined;
let _companiesDbPath: string | undefined;
let _breachesDbPath: string | undefined;


export function initDb(dbPath: string, companiesDbPath: string, breachesDbPath: string): void {
  _dbPath = dbPath;
  _companiesDbPath = companiesDbPath;
  _breachesDbPath = breachesDbPath;
  configureGlobalForAccountDb(dbPath);
}

function configureGlobalForAccountDb(accountDbPath: string): void {
  configureGlobalDbPath(
    accountDbPath === ":memory:"
      ? ":memory:"
      : join(dirname(accountDbPath), "global.db"),
  );
}
function getDbPath(): string {
  if (_dbPath) return _dbPath;
  throw new Error("Database not initialized: initDb() must be called before accessing the database");
}

function getCompaniesDbPath(): string {
  if (_companiesDbPath) return _companiesDbPath;
  const { app } = getElectron();
  const { is } = require("@electron-toolkit/utils") as typeof import("@electron-toolkit/utils");
  return is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
}

function getBreachesDbPath(): string {
  if (_breachesDbPath) return _breachesDbPath;
  const { app } = getElectron();
  const { is } = require("@electron-toolkit/utils") as typeof import("@electron-toolkit/utils");
  return is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
}

export function getDb(): Database.Database {
  getDatabaseKey();
  if (db) return db;
  const dbPath = getDbPath();
  // Account creation is explicit; a late read must not undo account deletion.
  const next = openDatabase(dbPath, { fileMustExist: true });
  try {
    next.pragma("journal_mode = WAL");
    next.pragma("foreign_keys = ON");
    next.pragma("busy_timeout = 5000");
    initSchema(next);
    attachCompaniesDb(next);
    attachBreachesDb(next);
    attachGlobalDb(next);
    const tag = basename(dbPath, ".db").split("_").pop()?.slice(0, 6) ?? "?";
    dbLog.info(`Database initialized [${tag}]`);
  } catch (error) {
    next.close();
    throw error;
  }
  db = next;
  return db;
}

export function withAccountDbReadConnection<T>(
  dbPath: string,
  read: (database: Database.Database) => T,
): T {
  const database = openDatabase(dbPath, { fileMustExist: true });
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    initSchema(database);
    attachCompaniesDb(database);
    attachBreachesDb(database);
    database.pragma("query_only = ON");
    return read(database);
  } finally {
    database.close();
  }
}

export function reconnectDb(newDbPath: string): void {
  if (db) {
    db.close();
    db = undefined;
  }
  _dbPath = newDbPath;
  configureGlobalForAccountDb(newDbPath);
  getDb();
}

export function createAccountDb(dbPath: string): void {
  const newDb = openDatabase(dbPath);
  newDb.pragma("journal_mode = WAL");
  newDb.pragma("foreign_keys = ON");
  initSchema(newDb);
  // Fresh accounts already use all-mail scanning and the current analysis engine.
  // Do not replay the v0.4/v0.5 resync migrations on their next startup.
  newDb.exec(`
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('migration:all-mail-scope', '1'),
      ('migration:engine-switch', '1');
  `);
  attachCompaniesDb(newDb);
  attachBreachesDb(newDb);
  newDb.close();
  const tag = basename(dbPath, ".db").split("_").pop()?.slice(0, 6) ?? "?";
  dbLog.info(`Account DB created [${tag}]`);
}

export function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_domain TEXT NOT NULL,
      company_slug TEXT,
      name TEXT NOT NULL,
      category_id TEXT,
      risk_level TEXT,
      first_seen INTEGER,
      last_seen INTEGER,
      message_count INTEGER DEFAULT 0,
      sender_count INTEGER DEFAULT 0,
      has_marketing INTEGER DEFAULT 0,
      has_account INTEGER DEFAULT 0,
      status TEXT,
      account_email TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_root_domain ON vendors(root_domain);
    CREATE INDEX IF NOT EXISTS idx_vendors_company_slug ON vendors(company_slug) WHERE company_slug IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_vendors_last_seen ON vendors(last_seen DESC);
    CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category_id);
    CREATE INDEX IF NOT EXISTS idx_vendors_risk ON vendors(risk_level);
    CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      vendor_id INTEGER NOT NULL,
      sender_email TEXT NOT NULL,
      sender_name TEXT,
      subject TEXT,
      date INTEGER NOT NULL,
      body_preview TEXT,
      raw_headers TEXT,
      type TEXT,
      unsubscribe_url TEXT,
      unsubscribe_method TEXT,
      status TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      body_text TEXT,
      body_state TEXT NOT NULL DEFAULT 'missing',
      analysis_version TEXT,
      received_address TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    CREATE INDEX IF NOT EXISTS idx_messages_unsubscribe_method ON messages(unsubscribe_method) WHERE unsubscribe_method IS NOT NULL AND unsubscribe_method != 'none';

    CREATE TABLE IF NOT EXISTS gdpr_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      outcome TEXT,
      recipient_email TEXT,
      sent_message_id TEXT,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      last_viewed_at INTEGER,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_gdpr_cases_vendor ON gdpr_cases(vendor_id);

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      sender_email TEXT,
      unsubscribe_url TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      actioned_at INTEGER NOT NULL,
      case_id INTEGER REFERENCES gdpr_cases(id) ON DELETE CASCADE,
      message_id TEXT,
      subject TEXT,
      body TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_action_log_vendor ON action_log(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_action_log_actioned ON action_log(actioned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_action_log_type ON action_log(action_type);
    CREATE INDEX IF NOT EXISTS idx_action_log_url ON action_log(unsubscribe_url) WHERE unsubscribe_url IS NOT NULL;

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_sync_at INTEGER,
      next_page_token TEXT,
      page_since INTEGER,
      quick_sync_done_at INTEGER,
      historical_cursor INTEGER,
      historical_done INTEGER DEFAULT 0,
      sync_checkpoint TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Only what a query reads. The raw value, its offsets and the detector's
    -- confidence stay in the engine's in-memory Finding; the analyzing engine
    -- version is stamped once per message on messages.analysis_version, which
    -- is what the catch-up pass compares against.
    CREATE TABLE IF NOT EXISTS pii_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      type TEXT NOT NULL,
      value_normalized TEXT NOT NULL,
      country TEXT,
      in_quoted_text INTEGER NOT NULL DEFAULT 0,
      in_footer INTEGER NOT NULL DEFAULT 0,
      self_reference INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pii_findings_message ON pii_findings(message_id);

  `);

  migrateActionLog(d);
  migrateVendors(d);
  migrateGdprCases(d);
  migrateMessages(d);
  migrateSyncState(d);
  migrateQueryIndexes(d);

  d.prepare("INSERT OR IGNORE INTO sync_state (id) VALUES (1)").run();
}

function attachCompaniesDb(d: Database.Database) {
  const companiesPath = getCompaniesDbPath();
  if (!existsSync(companiesPath)) {
    dbLog.warn(`Companies DB not found at ${companiesPath} — skipping attach`);
    return;
  }
  attachDatabase(d, companiesPath, "companies");
}

function attachBreachesDb(d: Database.Database) {
  const breachesPath = getBreachesDbPath();
  if (!existsSync(breachesPath)) {
    dbLog.warn(`Breaches DB not found at ${breachesPath} — skipping attach`);
    return;
  }
  attachDatabase(d, breachesPath, "breaches");
}

function deleteSqliteFiles(dbPath: string): void {
  let failed = false;
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error("Could not delete local database files");
}

export function deleteDbFiles(email: string): void {
  const { app } = getElectron();
  const dbPath = join(app.getPath("userData"), `${emailToFileKey(email)}.db`);
  deleteSqliteFiles(dbPath);
}

export function wipeDatabase(): void {
  if (db) {
    db.close();
    db = undefined;
  }
  if (_dbPath && _dbPath !== ":memory:") deleteSqliteFiles(_dbPath);
}
