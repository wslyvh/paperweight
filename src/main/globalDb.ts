import Database from "better-sqlite3";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { dbLog } from "./utils/log";

let db: Database.Database | undefined;
let configuredPath: string | undefined;
let openPath: string | undefined;

function defaultGlobalDbPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  return join(app.getPath("userData"), "global.db");
}

export function getGlobalDbPath(): string {
  return configuredPath ?? defaultGlobalDbPath();
}

export function hasReadableGlobalState(): boolean {
  const path = getGlobalDbPath();
  return (
    path === ":memory:"
    || existsSync(path)
    || existsSync(join(dirname(path), "settings.json"))
  );
}

export function configureGlobalDbPath(path: string): void {
  if (openPath && openPath !== path) {
    db?.close();
    db = undefined;
    openPath = undefined;
  }
  configuredPath = path;
}

function globalSchemaSql(schema: "main" | "global"): string {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}.app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      birth_year INTEGER CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 9999),
      birth_month INTEGER CHECK (birth_month IS NULL OR birth_month BETWEEN 1 AND 12),
      birth_day INTEGER CHECK (birth_day IS NULL OR birth_day BETWEEN 1 AND 31),
      country TEXT CHECK (country IS NULL OR length(country) = 2)
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      value_normalized TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number_raw TEXT NOT NULL,
      value_normalized TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      street TEXT,
      house_number TEXT,
      postal_code TEXT,
      city TEXT,
      country TEXT,
      raw TEXT,
      value_normalized TEXT NOT NULL UNIQUE,
      postal_code_normalized TEXT,
      CHECK (
        (
          raw IS NOT NULL
          AND street IS NULL
          AND house_number IS NULL
          AND postal_code IS NULL
          AND city IS NULL
          AND country IS NULL
        )
        OR
        (
          raw IS NULL
          AND street IS NOT NULL
          AND house_number IS NOT NULL
          AND postal_code IS NOT NULL
          AND city IS NOT NULL
          AND country IS NOT NULL
          AND length(country) = 2
        )
      )
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile_national_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value_normalized TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS ${schema}.profile_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('iban', 'credit_card')),
      value_normalized TEXT NOT NULL,
      UNIQUE (type, value_normalized)
    );

    CREATE TABLE IF NOT EXISTS ${schema}.pii_suppressions (
      type TEXT NOT NULL,
      value_normalized TEXT NOT NULL,
      PRIMARY KEY (type, value_normalized)
    );

    INSERT INTO ${schema}.profile (id)
      VALUES (1)
      ON CONFLICT(id) DO NOTHING;
  `;
}

function recreateProfileMatchValuesView(
  target: Database.Database,
  schema: "main" | "global",
): void {
  // View-only replacement is deliberately non-destructive: reverting the code
  // can recreate the prior definition while stored profile data remains intact.
  const replace = target.transaction(() => {
    target.exec(`
      DROP VIEW IF EXISTS ${schema}.profile_match_values;

      CREATE VIEW ${schema}.profile_match_values AS
        SELECT 'email' AS type, value_normalized
          FROM profile_emails
        UNION ALL
        SELECT 'phone', value_normalized
          FROM profile_phones
        UNION ALL
        SELECT 'address', value_normalized
          FROM profile_addresses
         WHERE raw IS NULL OR postal_code_normalized IS NULL
        UNION ALL
        SELECT 'postal_code', postal_code_normalized
          FROM profile_addresses
         WHERE postal_code_normalized IS NOT NULL
        UNION ALL
        SELECT 'national_id', value_normalized
          FROM profile_national_ids
        UNION ALL
        SELECT type, value_normalized
          FROM profile_payments
        UNION ALL
        SELECT 'date_of_birth', printf('%04d-%02d-%02d', birth_year, birth_month, birth_day)
          FROM profile
         WHERE birth_year IS NOT NULL
           AND birth_month IS NOT NULL
           AND birth_day IS NOT NULL;
    `);
  });
  replace();
}

function initGlobalSchema(target: Database.Database, schema: "main" | "global"): void {
  target.exec(globalSchemaSql(schema));
  recreateProfileMatchValuesView(target, schema);
}

function migrateLegacySettings(target: Database.Database, globalPath: string): void {
  if (globalPath === ":memory:") return;
  const settingsPath = join(dirname(globalPath), "settings.json");
  if (!existsSync(settingsPath)) return;

  let legacy: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      dbLog.warn("Global settings migration skipped: settings.json is not an object");
      return;
    }
    legacy = parsed as Record<string, unknown>;
  } catch {
    dbLog.warn("Global settings migration skipped: settings.json is invalid");
    return;
  }

  const migrate = target.transaction(() => {
    const saveSetting = target.prepare(
      `INSERT INTO app_settings (key, value_json)
       VALUES (?, ?)
       ON CONFLICT(key) DO NOTHING`,
    );
    for (const [key, value] of Object.entries(legacy)) {
      saveSetting.run(key, JSON.stringify(value));
    }
  });

  migrate();

  try {
    unlinkSync(settingsPath);
    dbLog.info("Migrated global settings to global.db");
  } catch {
    dbLog.warn("Global settings migrated, but settings.json could not be removed");
  }
}

function openInitializedGlobalDb(path: string): Database.Database {
  const next = new Database(path);
  try {
    next.pragma("journal_mode = WAL");
    next.pragma("foreign_keys = ON");
    next.pragma("busy_timeout = 5000");
    initGlobalSchema(next, "main");
    migrateLegacySettings(next, path);
  } catch (error) {
    next.close();
    throw error;
  }
  return next;
}

export function getGlobalDb(): Database.Database {
  if (db) return db;
  const path = getGlobalDbPath();
  const next = openInitializedGlobalDb(path);
  db = next;
  openPath = path;
  return db;
}

export function attachGlobalDb(target: Database.Database): void {
  const path = getGlobalDbPath();
  if (path !== ":memory:" && (!db || openPath !== path)) {
    const temporary = openInitializedGlobalDb(path);
    temporary.close();
  }
  target.prepare("ATTACH DATABASE ? AS global").run(path);
  if (path === ":memory:") initGlobalSchema(target, "global");
}

export function resetGlobalDb(): void {
  db?.close();
  db = undefined;
  openPath = undefined;
  configuredPath = undefined;
}

export function wipeGlobalDatabase(): void {
  const path = getGlobalDbPath();
  resetGlobalDb();
  if (path === ":memory:") return;
  let failed = false;
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error("Could not delete global database files");
}
