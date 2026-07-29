import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
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

jest.mock("./utils/log", () => ({
  dbLog: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  attachGlobalDb,
  getGlobalDb,
  resetGlobalDb,
  wipeGlobalDatabase,
} from "./globalDb";
import {
  getGlobalSetting,
  saveGlobalSetting,
} from "./services/globalSettings";

describe("global.db", () => {
  beforeEach(() => {
    resetGlobalDb();
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-global-"));
  });

  afterEach(() => {
    resetGlobalDb();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("migrates every JSON setting, then removes settings.json", () => {
    const settingsPath = join(userDataDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        autoLaunch: true,
        activeAccount: "user@example.com",
        colorTheme: "silk",
        futureSetting: { enabled: true },
      }),
    );

    expect(getGlobalSetting("colorTheme")).toBe("silk");
    const target = getGlobalDb();

    expect(existsSync(settingsPath)).toBe(false);
    expect(
      target
        .prepare("SELECT value_json FROM app_settings WHERE key = 'futureSetting'")
        .pluck()
        .get(),
    ).toBe('{"enabled":true}');
    expect(
      target
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name LIKE 'profile%'
           ORDER BY name`,
        )
        .pluck()
        .all(),
    ).toEqual([
      "profile",
      "profile_addresses",
      "profile_emails",
      "profile_names",
      "profile_national_ids",
      "profile_payments",
      "profile_phones",
    ]);
    expect(
      target
        .prepare(
          `SELECT 1 FROM sqlite_master
           WHERE type = 'view' AND name = 'profile_match_values'`,
        )
        .get(),
    ).toBeDefined();
  });

  it("keeps existing database values when retrying a committed migration", () => {
    saveGlobalSetting("colorTheme", "dim");
    resetGlobalDb();
    const settingsPath = join(userDataDir, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ colorTheme: "silk" }));

    expect(getGlobalSetting("colorTheme")).toBe("dim");
    expect(existsSync(settingsPath)).toBe(false);
  });

  it("initializes and migrates before attaching", () => {
    const settingsPath = join(userDataDir, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ colorTheme: "silk" }));
    const account = new Database(":memory:");

    attachGlobalDb(account);

    expect(
      account
        .prepare(
          `SELECT value_json FROM global.app_settings
           WHERE key = 'colorTheme'`,
        )
        .pluck()
        .get(),
    ).toBe('"silk"');
    expect(existsSync(settingsPath)).toBe(false);
    account.close();
  });

  it("rolls back all settings and retains JSON when migration fails", () => {
    const path = join(userDataDir, "global.db");
    const broken = new Database(path);
    broken.exec(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        CHECK (key != 'launchMinimized')
      );
    `);
    broken.close();
    const settingsPath = join(userDataDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ colorTheme: "silk", launchMinimized: true }),
    );

    expect(() => getGlobalDb()).toThrow();
    expect(existsSync(settingsPath)).toBe(true);

    const inspect = new Database(path, { readonly: true });
    expect(
      inspect.prepare("SELECT COUNT(*) FROM app_settings").pluck().get(),
    ).toBe(0);
    inspect.close();
  });

  it("enforces that opaque raw addresses cannot carry hidden country data", () => {
    const target = getGlobalDb();

    expect(() => {
      target
        .prepare(
          `INSERT INTO profile_addresses
             (raw, country, value_normalized)
           VALUES (?, ?, ?)`,
        )
        .run("California Road, CA, US", "NL", "california road, ca, us");
    }).toThrow();

    expect(() => {
      target
        .prepare(
          `INSERT INTO profile_addresses
             (raw, value_normalized)
           VALUES (?, ?)`,
        )
        .run("California Road, CA, US", "california road, ca, us");
    }).not.toThrow();
  });

  it("does not expose a standalone postal code as a full address match", () => {
    const target = getGlobalDb();
    target.exec(`
      INSERT INTO profile_addresses
        (raw, value_normalized, postal_code_normalized)
      VALUES
        ('1234 AB', '1234 ab', '1234AB');

      INSERT INTO profile_addresses
        (raw, value_normalized)
      VALUES
        ('Voorbeeldsingel 7 1234 AB Teststad',
         'voorbeeldsingel 7 1234 ab teststad');

      INSERT INTO profile_addresses
        (street, house_number, postal_code, city, country,
         value_normalized, postal_code_normalized)
      VALUES
        ('Keizersgracht', '1', '1015 CC', 'Amsterdam', 'NL',
         'keizersgracht 1 1015 cc amsterdam', '1015CC');
    `);

    expect(
      target
        .prepare(
          `SELECT type, value_normalized
           FROM profile_match_values
           ORDER BY type, value_normalized`,
        )
        .all(),
    ).toEqual([
      {
        type: "address",
        value_normalized: "keizersgracht 1 1015 cc amsterdam",
      },
      {
        type: "address",
        value_normalized: "voorbeeldsingel 7 1234 ab teststad",
      },
      { type: "postal_code", value_normalized: "1015CC" },
      { type: "postal_code", value_normalized: "1234AB" },
    ]);
  });

  it("keeps only consumed columns in the global profile schema", () => {
    const target = getGlobalDb();
    const columns = (name: string) => (
      target.pragma(`table_info(${name})`) as Array<{ name: string }>
    ).map((column) => column.name);

    expect(columns("profile")).not.toContain("updated_at");
    expect(columns("pii_suppressions")).toEqual([
      "type",
      "value_normalized",
    ]);
    expect(columns("profile_match_values")).toEqual([
      "type",
      "value_normalized",
    ]);
  });

  it("wipes the global database and its sidecars", () => {
    saveGlobalSetting("colorTheme", "silk");
    const path = join(userDataDir, "global.db");
    expect(existsSync(path)).toBe(true);

    wipeGlobalDatabase();

    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(existsSync(`${path}-shm`)).toBe(false);
  });

  it("surfaces global database deletion failures", () => {
    mkdirSync(join(userDataDir, "global.db"));

    expect(() => wipeGlobalDatabase()).toThrow(
      "Could not delete global database files",
    );
  });
});
