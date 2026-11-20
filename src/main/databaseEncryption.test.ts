import { vi } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import CipherDatabase from "better-sqlite3-multiple-ciphers";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const storage = vi.hoisted(() => ({
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: vi.fn(async (text: string) => Buffer.from(`protected:${text}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => {
    if (!value.toString().startsWith("protected:")) throw new Error("Invalid key");
    return { result: value.toString().slice(10), shouldReEncrypt: false };
  }),
}));
vi.mock("electron", () => ({ safeStorage: storage }));
vi.unmock("./databaseEncryption");
import { initializeDatabaseEncryption, openDatabase, attachDatabase, setDatabaseKey, getDatabaseKey, DATABASE_KEY_FILE, encryptAccountRegistry, decryptAccountRegistry } from "./databaseEncryption";
import { DATA_UNLOCK_ERROR, STORAGE_UNAVAILABLE_ERROR, storageFailureState } from "../shared/secureStorage";

let directory: string;
beforeEach(() => {
  vi.clearAllMocks();
  setDatabaseKey();
  directory = mkdtempSync(join(tmpdir(), "paperweight-cipher-test-"));
});
afterEach(() => { setDatabaseKey(); rmSync(directory, { recursive: true, force: true }); });

it("creates encrypted database and WAL pages, with encrypted global and plaintext reference attachments", async () => {
  await initializeDatabaseEncryption(directory);
  const path = join(directory, "person_abcdef.db");
  const db = openDatabase(path);
  try {
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE messages(body TEXT); INSERT INTO messages VALUES ('synthetic-private-body')");
    attachDatabase(db, join(directory, "global.db"), "global");
    db.exec("CREATE TABLE global.profile(name TEXT); INSERT INTO global.profile VALUES ('synthetic-private-name')");
    attachDatabase(db, join(directory, "companies.db"), "companies");
    db.exec("CREATE TABLE companies.public_data(name TEXT)");
    expect(readFileSync(`${path}-wal`).includes(Buffer.from("synthetic-private-body"))).toBe(false);
  } finally { db.close(); }
  const plain = new Database(path);
  try { expect(() => plain.prepare("SELECT * FROM messages").all()).toThrow(); } finally { plain.close(); }
  const reopened = openDatabase(path);
  try { expect(reopened.prepare("SELECT body FROM messages").pluck().get()).toBe("synthetic-private-body"); } finally { reopened.close(); }
  expect(readFileSync(path).includes(Buffer.from("synthetic-private-body"))).toBe(false);
});

it("converts existing account/global databases, preserving their contents and existing WAL commits", async () => {
  for (const name of ["person_abcdef.db", `account_${"a".repeat(64)}.db`, "global.db"]) {
    const db = new Database(join(directory, name));
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE records(value TEXT); INSERT INTO records VALUES ('keep-this-private-value')");
    db.close();
  }
  await initializeDatabaseEncryption(directory);
  const savedKey = readFileSync(join(directory, DATABASE_KEY_FILE));
  await initializeDatabaseEncryption(directory);
  expect(readFileSync(join(directory, DATABASE_KEY_FILE))).toEqual(savedKey);
  for (const name of ["person_abcdef.db", `account_${"a".repeat(64)}.db`, "global.db"]) {
    const db = openDatabase(join(directory, name));
    try { expect(db.prepare("SELECT value FROM records").pluck().get()).toBe("keep-this-private-value"); } finally { db.close(); }
    expect(readFileSync(join(directory, name)).includes(Buffer.from("keep-this-private-value"))).toBe(false);
    expect(existsSync(join(directory, `${name}.encrypting`))).toBe(false);
  }
});

it("never replaces a missing key while encrypted data exists", async () => {
  await initializeDatabaseEncryption(directory);
  const db = openDatabase(join(directory, "global.db"));
  db.exec("CREATE TABLE profile(value TEXT)"); db.close();
  unlinkSync(join(directory, DATABASE_KEY_FILE));
  setDatabaseKey();
  await expect(initializeDatabaseEncryption(directory)).rejects.toThrow(DATA_UNLOCK_ERROR);
  expect(existsSync(join(directory, DATABASE_KEY_FILE))).toBe(false);
});

it("preserves the original database and key when conversion fails, then succeeds on retry", async () => {
  const path = join(directory, "global.db");
  const legacy = new Database(path);
  legacy.exec("CREATE TABLE records(value TEXT); INSERT INTO records VALUES ('preserve-on-failure')");
  legacy.close();
  const rekey = vi.spyOn(CipherDatabase.prototype, "rekey").mockImplementationOnce(() => { throw new Error("Conversion failed"); });
  try {
    await expect(initializeDatabaseEncryption(directory)).rejects.toThrow("Conversion failed");
  } finally { rekey.mockRestore(); }
  const savedKey = readFileSync(join(directory, DATABASE_KEY_FILE));
  const original = new Database(path);
  try { expect(original.prepare("SELECT value FROM records").pluck().get()).toBe("preserve-on-failure"); } finally { original.close(); }
  expect(existsSync(`${path}.encrypting`)).toBe(false);
  await initializeDatabaseEncryption(directory);
  expect(readFileSync(join(directory, DATABASE_KEY_FILE))).toEqual(savedKey);
  const encrypted = openDatabase(path);
  try { expect(encrypted.prepare("SELECT value FROM records").pluck().get()).toBe("preserve-on-failure"); } finally { encrypted.close(); }
});

it("distinguishes unavailable storage from a damaged saved key and preserves both", async () => {
  const path = join(directory, DATABASE_KEY_FILE);
  writeFileSync(path, "unreadable-existing-key");
  storage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false);
  await expect(initializeDatabaseEncryption(directory)).rejects.toThrow(STORAGE_UNAVAILABLE_ERROR);
  await expect(initializeDatabaseEncryption(directory)).rejects.toThrow(DATA_UNLOCK_ERROR);
  expect(readFileSync(path, "utf8")).toBe("unreadable-existing-key");
});

it("MCP cannot create keys or migrate legacy data", async () => {
  await expect(initializeDatabaseEncryption(directory, false)).rejects.toThrow(DATA_UNLOCK_ERROR);
  expect(existsSync(join(directory, DATABASE_KEY_FILE))).toBe(false);
  await initializeDatabaseEncryption(directory);
  const db = new Database(join(directory, "person_abcdef.db"));
  db.exec("CREATE TABLE messages(value TEXT)"); db.close();
  await expect(initializeDatabaseEncryption(directory, false)).rejects.toThrow(DATA_UNLOCK_ERROR);
});

it("invalidates cached access when reset removes or replaces the protected key", async () => {
  await initializeDatabaseEncryption(directory);
  expect(getDatabaseKey().key).toHaveLength(64);
  writeFileSync(join(directory, DATABASE_KEY_FILE), "replacement");
  expect(() => getDatabaseKey()).toThrow(DATA_UNLOCK_ERROR);
});

it("protects the registry, rejects tampering, and does not replace a missing key when only the registry remains", async () => {
  await initializeDatabaseEncryption(directory);
  const plaintext = JSON.stringify({ accounts: [{ email: "private-person@example.test", providerType: "imap" }] });
  const encrypted = encryptAccountRegistry(plaintext);
  expect(encrypted).not.toContain("private-person");
  expect(decryptAccountRegistry(encrypted)).toBe(plaintext);
  const damaged = JSON.parse(encrypted);
  damaged.tag = Buffer.alloc(16).toString("base64");
  expect(() => decryptAccountRegistry(JSON.stringify(damaged))).toThrow(DATA_UNLOCK_ERROR);
  writeFileSync(join(directory, "accounts.json"), encrypted);
  unlinkSync(join(directory, DATABASE_KEY_FILE));
  await expect(initializeDatabaseEncryption(directory)).rejects.toThrow(DATA_UNLOCK_ERROR);
  expect(existsSync(join(directory, DATABASE_KEY_FILE))).toBe(false);
});

it("reports an existing WAL reader as busy and migrates successfully after it closes", async () => {
  const path = join(directory, "global.db");
  const reader = new Database(path);
  reader.pragma("journal_mode = WAL");
  reader.exec("CREATE TABLE records(value TEXT); INSERT INTO records VALUES ('preserved')");
  reader.close();
  const holder = spawn(process.execPath, ["-e", `
    const Database = require("better-sqlite3");
    const db = new Database(process.argv[1]);
    db.prepare("SELECT value FROM records").get();
    process.on("message", () => { db.close(); process.exit(0); });
    process.send("ready");
  `, path], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  await once(holder, "message");
  try {
    const error = await initializeDatabaseEncryption(directory).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "SQLITE_BUSY" });
    expect(storageFailureState(error)).toBe("busy");
  } finally {
    const exited = once(holder, "exit");
    holder.send("close");
    await exited;
  }
  const savedKey = readFileSync(join(directory, DATABASE_KEY_FILE));
  await initializeDatabaseEncryption(directory);
  expect(readFileSync(join(directory, DATABASE_KEY_FILE))).toEqual(savedKey);
  const db = openDatabase(path);
  try { expect(db.prepare("SELECT value FROM records").pluck().get()).toBe("preserved"); } finally { db.close(); }
});

it("reserves key recovery for unlock errors, not unrelated startup failures", () => {
  expect(storageFailureState(new Error(STORAGE_UNAVAILABLE_ERROR))).toBe("unavailable");
  expect(storageFailureState(new Error(DATA_UNLOCK_ERROR))).toBe("locked");
  expect(storageFailureState(Object.assign(new Error("file is not a database"), { code: "SQLITE_NOTADB" }))).toBe("locked");
  expect(storageFailureState(new Error("Conversion failed"))).toBe("failed");
  expect(storageFailureState(Object.assign(new Error("disk full"), { code: "SQLITE_FULL" }))).toBe("failed");
});
