import Database from "better-sqlite3";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ProfileBirthDate, UserProfile } from "@shared/types";

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

import {
  configureGlobalDbPath,
  getGlobalDb,
  resetGlobalDb,
} from "../globalDb";
import { emailToFileKey } from "../credentials";
import { getUserProfile, saveUserProfile } from "./profile";
import { seedProfileEmailsFromAccounts } from "./profileSeed";

function emptyProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    names: [],
    emails: [],
    phones: [],
    addresses: [],
    nationalIds: [],
    payments: [],
    ...overrides,
  };
}

describe("profile service", () => {
  beforeEach(() => {
    resetGlobalDb();
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-profile-"));
    configureGlobalDbPath(join(userDataDir, "global.db"));
    writeFileSync(
      join(userDataDir, "accounts.json"),
      JSON.stringify({
        accounts: [
          { email: "Person@Example.com", providerType: "gmail" },
        ],
      }),
    );
  });

  afterEach(() => {
    resetGlobalDb();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("round-trips one global profile and stores canonical match values", () => {
    saveUserProfile(emptyProfile({
      country: "nl",
      birthDate: { day: 9, month: 4, year: 1985 },
      names: [{
        id: -1,
        firstName: "  Ada ",
        middleName: " van ",
        lastName: " Example ",
      }],
      emails: [{
        id: -2,
        address: "Ada+Archive@Example.com",
      }],
      phones: [{
        id: -3,
        number: "+31 6 1234 5678",
      }],
      addresses: [
        {
          id: -4,
          mode: "structured",
          street: " Keizersgracht ",
          houseNumber: "1",
          postalCode: "1015 cc",
          city: "Amsterdam",
          country: "nl",
        },
        {
          id: -5,
          mode: "raw",
          raw: "California Road, CA, US",
        },
      ],
      nationalIds: [{
        id: -6,
        value: "ab 12 34",
      }],
      payments: [
        {
          id: -7,
          type: "iban",
          value: "NL91 ABNA 0417 1643 00",
        },
        {
          id: -8,
          type: "credit_card",
          value: "4111 1111 1111 1111",
        },
        {
          id: -9,
          type: "credit_card",
          value: "**** **** **** 1234",
        },
      ],
    }));

    resetGlobalDb();
    configureGlobalDbPath(join(userDataDir, "global.db"));
    const stored = getUserProfile();
    expect(stored.country).toBe("NL");
    expect(stored.birthDate).toEqual({ day: 9, month: 4, year: 1985 });
    expect(stored.names).toEqual([{
      id: expect.any(Number),
      firstName: "Ada",
      middleName: "van",
      lastName: "Example",
    }]);
    expect(stored.emails.map((entry) => entry.address).sort()).toEqual([
      "Ada+Archive@Example.com",
      "Person@Example.com",
    ]);
    expect(stored.phones[0]?.number).toBe("+31 6 1234 5678");
    expect(stored.addresses).toEqual([
      {
        id: expect.any(Number),
        mode: "structured",
        street: "Keizersgracht",
        houseNumber: "1",
        postalCode: "1015 cc",
        city: "Amsterdam",
        country: "NL",
      },
      {
        id: expect.any(Number),
        mode: "raw",
        raw: "California Road, CA, US",
      },
    ]);
    expect(stored.nationalIds[0]?.value).toBe("AB1234");
    expect(stored.payments.map((entry) => entry.value)).toEqual([
      "NL91ABNA0417164300",
      "4111111111111111",
      "****1234",
    ]);

    expect(
      getGlobalDb()
        .prepare(
          `SELECT value_normalized
           FROM profile_phones`,
        )
        .pluck()
        .get(),
    ).toBe("+31612345678");
    expect(
      getGlobalDb()
        .prepare(
          `SELECT raw, country, value_normalized
           FROM profile_addresses
           WHERE raw IS NOT NULL`,
        )
        .get(),
    ).toEqual({
      raw: "California Road, CA, US",
      country: null,
      value_normalized: "california road ca us",
    });
  });

  it("validates the whole snapshot before changing stored data", () => {
    saveUserProfile(emptyProfile({
      names: [{
        id: -1,
        firstName: "Ada",
        lastName: "Example",
      }],
    }));

    expect(() => saveUserProfile(emptyProfile({
      names: [{
        id: -2,
        firstName: "Changed",
        lastName: "Name",
      }],
      payments: [{
        id: -3,
        type: "credit_card",
        value: "4111 1111 1111 1112",
      }],
    }))).toThrow("Invalid profile payment");

    expect(getUserProfile().names[0]).toMatchObject({
      firstName: "Ada",
      lastName: "Example",
    });
  });

  it.each([
    { day: 33, month: 1, year: 2000 },
    { day: 1, month: 13, year: 2000 },
    { day: 30, month: 2, year: 2000 },
    { day: 1, month: 1, year: 1899 },
    { day: 1, month: 1, year: new Date().getUTCFullYear() + 1 },
  ] as ProfileBirthDate[])("rejects an invalid birth date: %o", (birthDate) => {
    expect(() => saveUserProfile(emptyProfile({ birthDate }))).toThrow(
      "Invalid profile birth date",
    );
  });

  it("rejects unknown country codes", () => {
    expect(() => saveUserProfile(emptyProfile({ country: "XX" }))).toThrow(
      "Invalid profile country",
    );
  });

  it("treats postcode-spacing variants as one profile address", () => {
    expect(() => saveUserProfile(emptyProfile({
      addresses: [
        {
          id: -1,
          mode: "raw",
          raw: "Voorbeeldsingel 7 1234AB Teststad",
        },
        {
          id: -2,
          mode: "raw",
          raw: "Voorbeeldsingel 7 1234 AB Teststad",
        },
      ],
    }))).toThrow("Duplicate profile address");
  });

  it.each([
    ["raw first", false],
    ["structured first", true],
  ])("prefers explicit address fields when the same address is supplied %s", (
    _description,
    structuredFirst,
  ) => {
    const raw = {
      id: -1,
      mode: "raw" as const,
      raw: "Voorbeeldsingel 7 1234 AB Teststad",
    };
    const structured = {
      id: -2,
      mode: "structured" as const,
      street: "Voorbeeldsingel",
      houseNumber: "7",
      postalCode: "1234 AB",
      city: "Teststad",
      country: "NL",
    };

    saveUserProfile(emptyProfile({
      addresses: structuredFirst
        ? [structured, raw]
        : [raw, structured],
    }));

    expect(getUserProfile().addresses).toEqual([{
      id: expect.any(Number),
      mode: "structured",
      street: "Voorbeeldsingel",
      houseNumber: "7",
      postalCode: "1234 AB",
      city: "Teststad",
      country: "NL",
    }]);
  });

  it("does not re-analyze an equivalent raw-to-structured address upgrade", () => {
    const postalCode = {
      id: -3,
      mode: "raw" as const,
      raw: "1234 AB",
    };
    const raw = {
      id: -1,
      mode: "raw" as const,
      raw: "Voorbeeldsingel 7 1234 AB Teststad",
    };
    const structured = {
      id: -2,
      mode: "structured" as const,
      street: "Voorbeeldsingel",
      houseNumber: "7",
      postalCode: "1234 AB",
      city: "Teststad",
      country: "NL",
    };

    // The complete raw line already supplies the same component anchors, and
    // the standalone postcode keeps the normalized match-value set unchanged.
    expect(saveUserProfile(emptyProfile({
      addresses: [postalCode, raw],
    }))).toBe(true);
    expect(saveUserProfile(emptyProfile({
      addresses: [postalCode, raw, structured],
    }))).toBe(false);
    expect(saveUserProfile(emptyProfile({
      addresses: [postalCode, structured],
    }))).toBe(false);
  });

  it("makes positive profile assertions win over prior suppressions", () => {
    const target = getGlobalDb();
    target.prepare(
      `INSERT INTO pii_suppressions (type, value_normalized)
       VALUES ('phone', '+31612345678'),
              ('email', 'unrelated@example.net')`,
    ).run();

    saveUserProfile(emptyProfile({
      phones: [{
        id: -1,
        number: "+31 6 1234 5678",
      }],
    }));

    expect(
      target
        .prepare(
          `SELECT type, value_normalized
           FROM pii_suppressions
           ORDER BY type`,
        )
        .all(),
    ).toEqual([{
      type: "email",
      value_normalized: "unrelated@example.net",
    }]);
  });

  it("does not let a profile save remove a connected email address", () => {
    saveUserProfile(emptyProfile());

    expect(getUserProfile().emails).toEqual([{
      id: expect.any(Number),
      address: "Person@Example.com",
    }]);
  });

  it("restores an account alias omitted by a stale profile snapshot", () => {
    const stale = getUserProfile();
    const account = new Database(
      join(userDataDir, `${emailToFileKey("Person@Example.com")}.db`),
    );
    account.exec(`
      CREATE TABLE vendors (account_email TEXT);
      CREATE TABLE pii_findings (type TEXT, value_normalized TEXT);
      INSERT INTO pii_findings (type, value_normalized)
        VALUES ('email', 'person+sync@example.com');
    `);
    account.close();

    expect(seedProfileEmailsFromAccounts()).toBe(2);
    saveUserProfile(stale);

    expect(
      getUserProfile().emails.map((entry) => entry.address).sort(),
    ).toEqual([
      "Person@Example.com",
      "person+sync@example.com",
    ]);
  });

  it("keeps local and explicit international phone forms distinct", () => {
    saveUserProfile(emptyProfile({
      phones: [
        { id: -1, number: "06 1234 5678" },
        { id: -2, number: "+31 6 1234 5678" },
      ],
    }));

    expect(
      getGlobalDb()
        .prepare(
          `SELECT value_normalized
           FROM profile_phones
           ORDER BY value_normalized`,
        )
        .pluck()
        .all(),
    ).toEqual(["+31612345678", "0612345678"]);
  });

  it("reports only changes to values used by profile-aware analysis", () => {
    expect(seedProfileEmailsFromAccounts()).toBe(1);

    expect(saveUserProfile(emptyProfile({
      names: [{
        id: -1,
        firstName: "Ada",
        lastName: "Example",
      }],
    }))).toBe(false);

    expect(saveUserProfile(emptyProfile({
      names: [{
        id: -1,
        firstName: "Ada",
        lastName: "Example",
      }],
      phones: [{
        id: -2,
        number: "+31 6 1234 5678",
      }],
    }))).toBe(true);

    expect(saveUserProfile(emptyProfile({
      names: [{
        id: -1,
        firstName: "Ada",
        lastName: "Example",
      }],
      phones: [{
        id: -2,
        number: "+31612345678",
      }],
    }))).toBe(false);
  });
});
