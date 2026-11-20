import CipherDatabase from "better-sqlite3-multiple-ciphers";
import type Database from "better-sqlite3";
import { randomBytes, createHash, hkdfSync, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync, renameSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { getElectron } from "./electronRuntime";
import { readSecureFile } from "./secureStorage";
import { DATA_UNLOCK_ERROR, STORAGE_UNAVAILABLE_ERROR } from "../shared/secureStorage";

export const DATABASE_KEY_FILE = "database-key.enc";
const SQLITE_HEADER = Buffer.from("SQLite format 3\0");
const ACCOUNT_DB = /^(?:account_[a-f0-9]{64}|[a-z0-9._-]*_[a-f0-9]{6})\.db$/;

interface DatabaseKey {
  key: string;
}

export interface DatabaseKeyContext {
  key: string;
  path: string;
  fingerprint: string;
}

let context: DatabaseKeyContext | undefined;

function fingerprint(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function setDatabaseKey(value?: DatabaseKeyContext): void {
  context = value;
}

export function getDatabaseKey(): DatabaseKeyContext {
  if (!context || !existsSync(context.path)
    || fingerprint(readFileSync(context.path)) !== context.fingerprint) {
    throw new Error(DATA_UNLOCK_ERROR);
  }
  return context;
}

function registryKey() {
  return Buffer.from(hkdfSync("sha256", Buffer.from(getDatabaseKey().key, "hex"), Buffer.alloc(0), "paperweight-account-registry-v1", 32));
}

// Keep the registry's synchronous file API. Its key is derived from the existing
// random database key; there is no additional stored secret or keyring entry.
export function encryptAccountRegistry(plaintext: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", registryKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

export function decryptAccountRegistry(serialized: string): string {
  try {
    const envelope = JSON.parse(serialized);
    if (envelope.version !== 1) throw new Error();
    const nonce = Buffer.from(envelope.nonce, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (nonce.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", registryKey(), nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch { throw new Error(DATA_UNLOCK_ERROR); }
}

export function openDatabase(path: string, options?: Database.Options): Database.Database {
  const key = getDatabaseKey();
  const database = new CipherDatabase(path, options);
  try {
    database.key(Buffer.from(key.key, "hex"));
    database.pragma("temp_store = MEMORY");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function attachDatabase(database: Database.Database, path: string, schema: "global" | "companies" | "breaches"): void {
  const key = schema === "global" ? Buffer.from(getDatabaseKey().key, "hex") : "";
  database.prepare(`ATTACH DATABASE ? AS ${schema} KEY ?`).run(path, key);
}

function personalDatabases(directory: string) {
  return readdirSync(directory).filter((name) => name === "global.db" || ACCOUNT_DB.test(name))
    .map((name) => join(directory, name));
}

function isPlaintext(path: string) {
  if (statSync(path).size === 0) return true;
  const file = openSync(path, "r");
  try {
    const header = Buffer.alloc(16);
    readSync(file, header, 0, 16, 0);
    return header.equals(SQLITE_HEADER);
  } finally { closeSync(file); }
}

// Called before migrations, workers or MCP queries can open personal databases.
// MCP only unlocks; desktop owns first setup and the one-time conversion.
export async function initializeDatabaseEncryption(directory: string, migrate = true): Promise<void> {
  const { safeStorage } = getElectron();
  try {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error();
    const probe = randomBytes(16).toString("hex");
    const protectedProbe = await safeStorage.encryptStringAsync(probe);
    if ((await safeStorage.decryptStringAsync(protectedProbe)).result !== probe) throw new Error();
  } catch {
    throw new Error(STORAGE_UNAVAILABLE_ERROR);
  }

  const databases = personalDatabases(directory);
  const keyPath = join(directory, DATABASE_KEY_FILE);
  if (!existsSync(keyPath)) {
    const registryPath = join(directory, "accounts.json");
    const encryptedRegistry = existsSync(registryPath)
      && !Array.isArray(JSON.parse(readFileSync(registryPath, "utf8")).accounts);
    if (!migrate || encryptedRegistry || databases.some((path) => !isPlaintext(path))) throw new Error(DATA_UNLOCK_ERROR);
    const value: DatabaseKey = { key: randomBytes(32).toString("hex") };
    const protectedKey = await safeStorage.encryptStringAsync(JSON.stringify(value));
    try {
      writeFileSync(keyPath, protectedKey, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  try {
    const value = await readSecureFile<DatabaseKey>(keyPath);
    if (!value || !/^[a-f0-9]{64}$/.test(value.key)) throw new Error();
    setDatabaseKey({ key: value.key, path: keyPath, fingerprint: fingerprint(readFileSync(keyPath)) });
  } catch {
    setDatabaseKey();
    throw new Error(DATA_UNLOCK_ERROR);
  }

  try {
    for (const path of databases) {
      if (isPlaintext(path)) {
        if (!migrate) throw new Error(DATA_UNLOCK_ERROR);
        await encryptExistingDatabase(path);
      }
      const database = openDatabase(path, { readonly: true, fileMustExist: true });
      try { database.prepare("SELECT count(*) FROM sqlite_master").get(); } finally { database.close(); }
    }
  } catch (error) {
    setDatabaseKey();
    throw error;
  }
}

async function encryptExistingDatabase(path: string): Promise<void> {
  const source = new CipherDatabase(path, { fileMustExist: true });
  const temporary = `${path}.encrypting`;
  try {
    // Leaving WAL requires exclusive access: another app/process must finish first.
    source.pragma("busy_timeout = 5000");
    source.pragma("journal_mode = DELETE");
    source.pragma("locking_mode = EXCLUSIVE");
    source.exec("BEGIN EXCLUSIVE; COMMIT");
    removeTemporaryDatabase(temporary);
    await source.backup(temporary);
    const converted = new CipherDatabase(temporary);
    try {
      converted.pragma("journal_mode = DELETE");
      converted.rekey(Buffer.from(getDatabaseKey().key, "hex"));
    } finally { converted.close(); }
    const verified = openDatabase(temporary, { readonly: true, fileMustExist: true });
    try {
      if (verified.pragma("integrity_check", { simple: true }) !== "ok") throw new Error();
    } finally { verified.close(); }
    source.close();
    renameSync(temporary, path);
  } finally {
    if (source.open) source.close();
    removeTemporaryDatabase(temporary);
  }
}

function removeTemporaryDatabase(path: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    if (existsSync(path + suffix)) unlinkSync(path + suffix);
  }
}

