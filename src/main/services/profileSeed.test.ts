import Database from "better-sqlite3";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

let userDataDir = "";

jest.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : "/tmp"),
  },
}));

jest.mock("../utils/log", () => ({
  dbLog: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { emailToFileKey } from "../credentials";
import {
  attachGlobalDb,
  configureGlobalDbPath,
  getGlobalDb,
  resetGlobalDb,
} from "../globalDb";
import {
  seedProfileCountryIfEmpty,
  seedProfileEmailsFromAccounts,
  seedProfileEmailsFromCurrentAccount,
} from "./profileSeed";

function createAccountDb(
  email: string,
  aliases: string[],
  findings: string[],
): void {
  const target = new Database(
    join(userDataDir, `${emailToFileKey(email)}.db`),
  );
  target.exec(`
    CREATE TABLE vendors (account_email TEXT);
    CREATE TABLE pii_findings (type TEXT, value_normalized TEXT);
  `);
  const addAlias = target.prepare(
    "INSERT INTO vendors (account_email) VALUES (?)",
  );
  for (const alias of aliases) addAlias.run(alias);
  const addFinding = target.prepare(
    "INSERT INTO pii_findings (type, value_normalized) VALUES ('email', ?)",
  );
  for (const finding of findings) addFinding.run(finding);
  target.close();
}

function profileEmails(target = getGlobalDb()): string[] {
  return target
    .prepare(
      "SELECT value_normalized FROM profile_emails ORDER BY value_normalized",
    )
    .pluck()
    .all() as string[];
}

describe("profile seed", () => {
  beforeEach(() => {
    resetGlobalDb();
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-profile-seed-"));
  });

  afterEach(() => {
    resetGlobalDb();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("seeds connected addresses and known plus aliases across account databases", () => {
    const first = "user@example.com";
    const second = "other@example.net";
    writeFileSync(
      join(userDataDir, "accounts.json"),
      JSON.stringify({
        accounts: [
          { email: first, providerType: "gmail" },
          { email: second, providerType: "imap" },
        ],
      }),
    );
    createAccountDb(
      first,
      ["user+shop@example.com"],
      ["user+receipt@example.com", "stranger+receipt@example.com"],
    );
    createAccountDb(second, [], ["other+archive@example.net"]);
    getGlobalDb()
      .prepare(
        `INSERT INTO pii_suppressions (type, value_normalized)
         VALUES ('email', 'user+receipt@example.com'),
                ('email', 'unrelated@example.org')`,
      )
      .run();

    expect(seedProfileEmailsFromAccounts()).toBe(5);
    expect(profileEmails()).toEqual([
      "other+archive@example.net",
      "other@example.net",
      "user+receipt@example.com",
      "user+shop@example.com",
      "user@example.com",
    ]);
    expect(
      getGlobalDb()
        .prepare(
          `SELECT value_normalized
           FROM pii_suppressions
           WHERE type = 'email'`,
        )
        .pluck()
        .all(),
    ).toEqual(["unrelated@example.org"]);

    writeFileSync(
      join(userDataDir, "accounts.json"),
      JSON.stringify({ accounts: [] }),
    );
    expect(seedProfileEmailsFromAccounts()).toBe(0);
    expect(profileEmails()).toHaveLength(5);
  });

  it("adds plus aliases learned by a later sync", () => {
    resetGlobalDb();
    configureGlobalDbPath(":memory:");
    const account = new Database(":memory:");
    account.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE vendors (account_email TEXT);
      CREATE TABLE pii_findings (type TEXT, value_normalized TEXT);
      INSERT INTO settings (key, value)
        VALUES ('accountEmail', 'user@example.com');
      INSERT INTO pii_findings (type, value_normalized)
        VALUES ('email', 'user+later@example.com'),
               ('email', 'someone+else@example.net');
    `);
    attachGlobalDb(account);

    expect(seedProfileEmailsFromCurrentAccount(account)).toBe(2);
    expect(
      account
        .prepare(
          `SELECT value_normalized
           FROM global.profile_emails
           ORDER BY value_normalized`,
        )
        .pluck()
        .all(),
    ).toEqual(["user+later@example.com", "user@example.com"]);
    account.close();
  });

  it("does not derive plus aliases from manually added profile emails", () => {
    resetGlobalDb();
    configureGlobalDbPath(":memory:");
    const account = new Database(":memory:");
    account.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE vendors (account_email TEXT);
      CREATE TABLE pii_findings (type TEXT, value_normalized TEXT);
      INSERT INTO settings (key, value)
        VALUES ('accountEmail', 'user@example.com');
      INSERT INTO pii_findings (type, value_normalized)
        VALUES ('email', 'user+later@example.com'),
               ('email', 'manual+found@example.net');
    `);
    attachGlobalDb(account);
    account.exec(`
      INSERT INTO global.profile_emails (address, value_normalized)
        VALUES ('manual@example.net', 'manual@example.net');
      INSERT INTO global.pii_suppressions (type, value_normalized)
        VALUES ('email', 'manual+found@example.net');
    `);

    expect(seedProfileEmailsFromCurrentAccount(account)).toBe(2);
    expect(
      account
        .prepare(
          `SELECT value_normalized
           FROM global.profile_emails
           ORDER BY value_normalized`,
        )
        .pluck()
        .all(),
    ).toEqual([
      "manual@example.net",
      "user+later@example.com",
      "user@example.com",
    ]);
    expect(
      account
        .prepare(
          `SELECT value_normalized
           FROM global.pii_suppressions
           WHERE type = 'email'`,
        )
        .pluck()
        .all(),
    ).toEqual(["manual+found@example.net"]);
    account.close();
  });

  it("reads plus aliases from an older account schema", () => {
    const email = "user@example.com";
    writeFileSync(
      join(userDataDir, "accounts.json"),
      JSON.stringify({
        accounts: [{ email, providerType: "gmail" }],
      }),
    );
    const account = new Database(
      join(userDataDir, `${emailToFileKey(email)}.db`),
    );
    account.exec(`
      CREATE TABLE vendors (id INTEGER PRIMARY KEY);
      CREATE TABLE pii_findings (type TEXT, value_normalized TEXT);
      INSERT INTO pii_findings (type, value_normalized)
        VALUES ('email', 'user+archive@example.com');
    `);
    account.close();

    expect(seedProfileEmailsFromAccounts()).toBe(2);
    expect(profileEmails()).toEqual([
      "user+archive@example.com",
      "user@example.com",
    ]);
  });

  it("infers country only while the stored profile country is empty", () => {
    expect(seedProfileCountryIfEmpty(() => "nl")).toBe(true);
    const inferAgain = jest.fn(() => "US");

    expect(seedProfileCountryIfEmpty(inferAgain)).toBe(false);
    expect(inferAgain).not.toHaveBeenCalled();
    expect(
      getGlobalDb()
        .prepare("SELECT country FROM profile WHERE id = 1")
        .pluck()
        .get(),
    ).toBe("NL");
  });

  it("does not seed an unknown country code", () => {
    expect(seedProfileCountryIfEmpty(() => "XX")).toBe(false);
    expect(
      getGlobalDb()
        .prepare("SELECT country FROM profile WHERE id = 1")
        .pluck()
        .get(),
    ).toBeNull();
  });
});
