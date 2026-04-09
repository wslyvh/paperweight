import Database from "better-sqlite3";
import { join, basename } from "path";
import { existsSync, unlinkSync } from "fs";
import { dbLog } from "./utils/log";
import { emailToFileKey } from "./credentials";

let db: Database.Database | undefined;

let _dbPath: string | undefined;
let _companiesDbPath: string | undefined;
let _breachesDbPath: string | undefined;
let _enforcementDbPath: string | undefined;


export function initDb(dbPath: string, companiesDbPath: string, breachesDbPath: string, enforcementDbPath: string): void {
  _dbPath = dbPath;
  _companiesDbPath = companiesDbPath;
  _breachesDbPath = breachesDbPath;
  _enforcementDbPath = enforcementDbPath;
}

function getDbPath(): string {
  if (_dbPath) return _dbPath;
  throw new Error("Database not initialized: initDb() must be called before accessing the database");
}

function getCompaniesDbPath(): string {
  if (_companiesDbPath) return _companiesDbPath;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { is } = require("@electron-toolkit/utils") as typeof import("@electron-toolkit/utils");
  return is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
}

function getBreachesDbPath(): string {
  if (_breachesDbPath) return _breachesDbPath;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { is } = require("@electron-toolkit/utils") as typeof import("@electron-toolkit/utils");
  return is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
}

function getEnforcementDbPath(): string {
  if (_enforcementDbPath) return _enforcementDbPath;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { is } = require("@electron-toolkit/utils") as typeof import("@electron-toolkit/utils");
  return is.dev
    ? join(app.getAppPath(), "resources", "enforcement.db")
    : join(process.resourcesPath, "enforcement.db");
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    attachCompaniesDb(db);
    attachBreachesDb(db);
    attachEnforcementDb(db);
    const tag = basename(_dbPath, ".db").split("_").pop() ?? "?";
    dbLog.info(`Database initialized [${tag}]`);
  }
  return db;
}

export function reconnectDb(newDbPath: string): void {
  if (db) {
    db.close();
    db = undefined;
  }
  _dbPath = newDbPath;
  getDb();
}

export function createAccountDb(dbPath: string): void {
  const newDb = new Database(dbPath);
  newDb.pragma("journal_mode = WAL");
  newDb.pragma("foreign_keys = ON");
  initSchema(newDb);
  attachCompaniesDb(newDb);
  attachBreachesDb(newDb);
  attachEnforcementDb(newDb);
  newDb.close();
  const tag = basename(dbPath, ".db").split("_").pop() ?? "?";
  dbLog.info(`Account DB created [${tag}]`);
}

function initSchema(d: Database.Database) {
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
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_vendor ON messages(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    CREATE INDEX IF NOT EXISTS idx_messages_unsubscribe_method ON messages(unsubscribe_method) WHERE unsubscribe_method IS NOT NULL AND unsubscribe_method != 'none';

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      sender_email TEXT,
      unsubscribe_url TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      actioned_at INTEGER NOT NULL,
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
  `);

  d.prepare("INSERT OR IGNORE INTO sync_state (id) VALUES (1)").run();
}

function attachCompaniesDb(d: Database.Database) {
  const companiesPath = getCompaniesDbPath();
  if (!existsSync(companiesPath)) {
    dbLog.warn(`Companies DB not found at ${companiesPath} — skipping attach`);
    return;
  }
  d.exec(`ATTACH DATABASE '${companiesPath}' AS companies`);
}

function attachBreachesDb(d: Database.Database) {
  const breachesPath = getBreachesDbPath();
  if (!existsSync(breachesPath)) {
    dbLog.warn(`Breaches DB not found at ${breachesPath} — skipping attach`);
    return;
  }
  d.exec(`ATTACH DATABASE '${breachesPath}' AS breaches`);
}

function attachEnforcementDb(d: Database.Database) {
  const enforcementPath = getEnforcementDbPath();
  if (!existsSync(enforcementPath)) {
    dbLog.warn(`Enforcement DB not found at ${enforcementPath} — skipping attach`);
    return;
  }
  d.exec(`ATTACH DATABASE '${enforcementPath}' AS enforcement`);
}

export function deleteDbFiles(email: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  const dbPath = join(app.getPath("userData"), `${emailToFileKey(email)}.db`);
  try {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    for (const suffix of ["-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (existsSync(p)) unlinkSync(p);
    }
  } catch {
    // Non-fatal
  }
}

export function wipeDatabase(): void {
  if (db) {
    db.close();
    db = undefined;
  }
  const dbPath = getDbPath();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
}
