jest.mock("../credentials", () => ({
  emailToFileKey: jest.fn(),
  listAccounts: jest.fn(() => []),
}));
jest.mock("../utils/log", () => {
  const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { dbLog: l, syncLog: l, appLog: l };
});

import { getDb, initDb } from "../db";
import {
  confirmPiiFinding,
  getPiiOverview,
  getPiiValueCompanies,
  getVendorPiiSummary,
  inferHomeCountry,
  maskValue,
  revealPiiValues,
  revealVendorPiiValues,
  suppressPiiFinding,
} from "./pii";
import type { PiiType } from "@shared/types";

function insertVendor(domain = "acme.com", accountEmail?: string): number {
  return Number(
    getDb()
      .prepare("INSERT INTO vendors (root_domain, name, account_email) VALUES (?, ?, ?)")
      .run(domain, domain, accountEmail ?? null).lastInsertRowid,
  );
}
function insertMsg(id: string, vid: number, date: number, analysisVersion?: string): void {
  getDb()
    .prepare(
      "INSERT INTO messages (id, vendor_id, sender_email, date, body_state, analysis_version) VALUES (?, ?, 'x@acme.com', ?, 'available', ?)",
    )
    .run(id, vid, date, analysisVersion ?? null);
}
function insertFinding(
  messageId: string,
  type: PiiType,
  valueNormalized: string,
  quoted = 0,
  flags: { footer?: number; selfReference?: number; country?: string } = {},
): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO pii_findings (message_id, type, value_normalized, country, in_quoted_text, in_footer, self_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        messageId,
        type,
        valueNormalized,
        flags.country ?? null,
        quoted,
        flags.footer ?? 0,
        flags.selfReference ?? 0,
      ).lastInsertRowid,
  );
}

function insertProfileMatch(type: PiiType, value: string): void {
  const target = getDb();
  switch (type) {
    case "email":
      target.prepare(
        `INSERT INTO global.profile_emails (address, value_normalized)
         VALUES (?, ?)`,
      ).run(value, value);
      break;
    case "phone":
      target.prepare(
        `INSERT INTO global.profile_phones (number_raw, value_normalized)
         VALUES (?, ?)`,
      ).run(value, value);
      break;
    case "address":
      target.prepare(
        `INSERT INTO global.profile_addresses (raw, value_normalized)
         VALUES (?, ?)`,
      ).run(value, value);
      break;
    case "postal_code":
      target.prepare(
        `INSERT INTO global.profile_addresses
           (raw, value_normalized, postal_code_normalized)
         VALUES (?, ?, ?)`,
      ).run(value, value, value);
      break;
    case "national_id":
      target.prepare(
        `INSERT INTO global.profile_national_ids (value_normalized)
         VALUES (?)`,
      ).run(value);
      break;
    case "iban":
    case "credit_card":
      target.prepare(
        `INSERT INTO global.profile_payments (type, value_normalized)
         VALUES (?, ?)`,
      ).run(type, value);
      break;
    case "date_of_birth": {
      const [year, month, day] = value.split("-").map(Number);
      target
        .prepare(
          `UPDATE global.profile
           SET birth_year = ?, birth_month = ?, birth_day = ?
           WHERE id = 1`,
        )
        .run(year, month, day);
      break;
    }
  }
}

beforeAll(() => initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent"));
beforeEach(() => {
  getDb().exec(
    `DELETE FROM global.pii_suppressions;
     DELETE FROM global.profile_emails;
     DELETE FROM global.profile_phones;
     DELETE FROM global.profile_addresses;
     DELETE FROM global.profile_national_ids;
     DELETE FROM global.profile_payments;
     UPDATE global.profile SET birth_year = NULL, birth_month = NULL, birth_day = NULL, country = NULL WHERE id = 1;
     DELETE FROM pii_findings;
     DELETE FROM messages;
     DELETE FROM vendors;`,
  );
});

describe("maskValue", () => {
  it("reveals only a recognizable hint per type", () => {
    expect(maskValue("email", "john.doe@example.com")).toBe("j•••@•••.com");
    expect(maskValue("iban", "NL91ABNA0417164300")).toBe("NL •••• 4300");
    expect(maskValue("credit_card", "4111111111111111")).toBe("•••• 1111");
    expect(maskValue("phone", "+31612345678")).toBe("+31 •••• 78");
    expect(maskValue("national_id", "123456789")).toBe("•••• 789");
    expect(maskValue("postal_code", "1012AB")).toBe("10•••");
    expect(maskValue("address", "reigerskamp 611")).toBe("rei•••");
    expect(maskValue("date_of_birth", "1985-04-09")).toBe("••-••-1985");
  });
});

describe("getVendorPiiSummary", () => {
  it("returns one masked row per unique value with stable recency", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertMsg("m2", vid, 200);
    const first = insertFinding("m1", "email", "a@b.com");
    insertFinding("m2", "email", "a@b.com"); // same value, second message

    const { values } = getVendorPiiSummary(vid);
    expect(values).toHaveLength(1);
    expect(values[0]).toEqual({
      ref: first, // representative finding id — the group's lowest
      type: "email",
      maskedValue: "a•••@•••.com",
      lastSeen: 200,
      companyCount: 1,
    });
  });

  it("never returns a raw or normalized value", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "iban", "NL91ABNA0417164300");

    const payload = JSON.stringify(getVendorPiiSummary(vid));
    expect(payload).not.toContain("NL91ABNA0417164300");
  });

  it("lists distinct values as separate rows", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "a@b.com");
    insertFinding("m1", "email", "c@d.com");
    expect(getVendorPiiSummary(vid).values).toHaveLength(2);
  });

  it("excludes quoted-text findings from the counts", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "phone", "+31612345678", 1); // quoted → not counted
    expect(getVendorPiiSummary(vid).values).toHaveLength(0);
  });

  it("scopes findings to the vendor via messages.vendor_id", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 100);
    insertFinding("m1", "email", "a@b.com");
    insertFinding("m2", "iban", "NL91ABNA0417164300");
    expect(getVendorPiiSummary(a).values.map((r) => r.type)).toEqual(["email"]);
    expect(getVendorPiiSummary(b).values.map((r) => r.type)).toEqual(["iban"]);
  });
});

describe("profile matches", () => {
  it("labels an exact email in the global profile", () => {
    insertProfileMatch("email", "user@example.com");
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "user@example.com");

    expect(getVendorPiiSummary(vid).values[0].isMatch).toBe(true);
  });

  it("labels matching non-email profile values", () => {
    insertProfileMatch("phone", "+31612345678");
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "phone", "+31612345678");

    expect(getVendorPiiSummary(vid).values[0].isMatch).toBe(true);
  });

  it("labels a matching date of birth and masks its day and month", () => {
    insertProfileMatch("date_of_birth", "1985-04-09");
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "date_of_birth", "1985-04-09");

    expect(getVendorPiiSummary(vid).values[0]).toEqual(
      expect.objectContaining({
        type: "date_of_birth",
        maskedValue: "••-••-1985",
        isMatch: true,
      }),
    );
  });

  it("leaves a value outside the profile unlabelled", () => {
    insertProfileMatch("email", "user@example.com");
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "support@acme.com");

    expect(getVendorPiiSummary(vid).values[0].isMatch).toBeUndefined();
  });

  it("keeps the same normalized text under another type separate", () => {
    insertProfileMatch("email", "user@example.com");
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "address", "user@example.com");

    expect(getVendorPiiSummary(vid).values[0].isMatch).toBeUndefined();
  });
});

describe("scanned message count", () => {
  it("counts messages the engine has analyzed", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100, "v1");
    insertMsg("m2", vid, 200, "v1");
    insertMsg("m3", vid, 300); // stored, not yet analyzed

    expect(getVendorPiiSummary(vid).scannedMessages).toBe(2);
  });

  it("counts messages analyzed by an older engine as scanned", () => {
    // The summary doesn't filter findings by engine version, so coverage must
    // not either — otherwise a version bump reports 0 scanned while the values
    // that bump has yet to refresh are still on screen.
    const vid = insertVendor();
    insertMsg("m1", vid, 100, "v0-old");
    expect(getVendorPiiSummary(vid).scannedMessages).toBe(1);
  });

  it("reports zero for a company with nothing scanned", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    expect(getVendorPiiSummary(vid).scannedMessages).toBe(0);
  });
});

describe("suppression by opaque reference", () => {
  it("moves the value into the company's Not mine list", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "a@b.com");

    const { ref } = getVendorPiiSummary(vid).values[0];
    suppressPiiFinding(ref);
    const summary = getVendorPiiSummary(vid);
    expect(summary.values).toHaveLength(0);
    expect(summary.suppressedValues).toEqual([
      expect.objectContaining({ ref, type: "email" }),
    ]);
  });

  it("hides the value everywhere, not just the company it was clicked on", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 100);
    insertFinding("m1", "email", "shared@x.com");
    insertFinding("m2", "email", "shared@x.com");

    suppressPiiFinding(getVendorPiiSummary(a).values[0].ref);
    expect(getVendorPiiSummary(a).values).toHaveLength(0);
    expect(getVendorPiiSummary(b).values).toHaveLength(0);
    expect(getVendorPiiSummary(a).suppressedValues).toHaveLength(1);
    expect(getVendorPiiSummary(b).suppressedValues).toHaveLength(1);
  });

  it("hides every occurrence of the value, not just the referenced finding", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertMsg("m2", vid, 200);
    const first = insertFinding("m1", "phone", "+31612345678");
    insertFinding("m2", "phone", "+31612345678");

    suppressPiiFinding(first);
    expect(getVendorPiiSummary(vid).values).toHaveLength(0);
  });

  it("leaves the same value under a different type visible", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const emailRef = insertFinding("m1", "email", "1012ab");
    insertFinding("m1", "postal_code", "1012ab");

    suppressPiiFinding(emailRef);
    expect(getVendorPiiSummary(vid).values.map((v) => v.type)).toEqual(["postal_code"]);
  });

  it("is idempotent", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "email", "a@b.com");

    suppressPiiFinding(ref);
    suppressPiiFinding(ref);
    const n = (
      getDb()
        .prepare("SELECT COUNT(*) n FROM global.pii_suppressions")
        .get() as { n: number }
    ).n;
    expect(n).toBe(1);
  });

  it("rejects a reference that no longer resolves", () => {
    // Re-analysis replaces a message's findings, so ids change under a handle
    // the renderer is still holding. Fail loudly — the caller refetches.
    expect(() => suppressPiiFinding(999_999)).toThrow(/no longer available/);
  });

  it("rejects Not mine when the value is in the profile", () => {
    insertProfileMatch("email", "a@b.com");
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "email", "a@b.com");

    expect(() => suppressPiiFinding(ref)).toThrow(/profile/);
    expect(
      getDb()
        .prepare("SELECT 1 FROM global.pii_suppressions")
        .all(),
    ).toEqual([]);
  });
});

describe("confirmPiiFinding", () => {
  it.each([
    ["email", "alex@personal.example"],
    ["phone", "+31612345678"],
    ["address", "4 sample street exampleton"],
    ["postal_code", "1012AB"],
    ["national_id", "AB1234"],
    ["iban", "NL91ABNA0417164300"],
    ["credit_card", "4111111111111111"],
  ] as Array<[PiiType, string]>)(
    "files a %s finding into the profile and clears Not mine",
    (type, value) => {
      const vid = insertVendor();
      insertMsg("m1", vid, 100);
      const ref = insertFinding("m1", type, value);
      suppressPiiFinding(ref);

      expect(confirmPiiFinding(ref)).toBe(true);

      expect(
        getDb()
          .prepare(
            `SELECT type, value_normalized
             FROM global.profile_match_values`,
          )
          .all(),
      ).toContainEqual({ type, value_normalized: value });
      expect(
        getDb()
          .prepare("SELECT 1 FROM global.pii_suppressions")
          .all(),
      ).toEqual([]);
      expect(getVendorPiiSummary(vid).values[0]).toEqual(
        expect.objectContaining({ type, isMatch: true }),
      );
    },
  );

  it("stores a standalone postal code as an opaque raw address", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "postal_code", "1012AB");

    confirmPiiFinding(ref);

    expect(
      getDb()
        .prepare(
          `SELECT raw, country, value_normalized, postal_code_normalized
           FROM global.profile_addresses`,
        )
        .get(),
    ).toEqual({
      raw: "1012AB",
      country: null,
      value_normalized: "1012AB",
      postal_code_normalized: "1012AB",
    });
    expect(
      getDb()
        .prepare(
          `SELECT type, value_normalized
           FROM global.profile_match_values`,
        )
        .all(),
    ).toEqual([{
      type: "postal_code",
      value_normalized: "1012AB",
    }]);
  });

  it("uses an existing structured address for its postal-code match", () => {
    getDb().prepare(
      `INSERT INTO global.profile_addresses
         (street, house_number, postal_code, city, country,
          value_normalized, postal_code_normalized)
       VALUES ('Sample Street', '4', '1012 AB', 'Exampleton', 'NL',
               'sample street 4 1012 ab exampleton', '1012AB')`,
    ).run();
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "postal_code", "1012AB");

    confirmPiiFinding(ref);

    expect(
      getDb()
        .prepare(
          `SELECT COUNT(*) AS count,
                  SUM(CASE WHEN raw IS NOT NULL THEN 1 ELSE 0 END) AS rawCount
           FROM global.profile_addresses`,
        )
        .get(),
    ).toEqual({ count: 1, rawCount: 0 });
  });

  it("is idempotent and rejects a reference that no longer resolves", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "email", "alex@personal.example");

    expect(confirmPiiFinding(ref)).toBe(true);
    expect(confirmPiiFinding(ref)).toBe(false);
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM global.profile_emails")
        .get(),
    ).toEqual({ count: 1 });
    expect(() => confirmPiiFinding(999_999)).toThrow(/no longer available/);
  });

  it("shows a profile value even if a stale suppression row exists", () => {
    insertProfileMatch("email", "alex@personal.example");
    getDb().prepare(
      `INSERT INTO global.pii_suppressions (type, value_normalized)
       VALUES ('email', 'alex@personal.example')`,
    ).run();
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "alex@personal.example");

    expect(getPiiOverview().values[0].isMatch).toBe(true);
    expect(getPiiOverview().suppressedValues).toHaveLength(0);
  });
});

describe("revealVendorPiiValues", () => {
  it("returns full values keyed by the same refs both summary lists handed out", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "someone@acme.example");
    const suppressed = insertFinding("m1", "iban", "NL91ABNA0417164300");
    suppressPiiFinding(suppressed);

    const summary = getVendorPiiSummary(vid);
    const revealed = revealVendorPiiValues(vid);
    const shown = [...summary.values, ...summary.suppressedValues];

    expect(revealed).toHaveLength(shown.length);
    const byRef = new Map(revealed.map((r) => [r.ref, r.value]));
    for (const v of shown) expect(byRef.get(v.ref)).toBeDefined();
    expect([...byRef.values()].sort()).toEqual([
      "NL91ABNA0417164300",
      "someone@acme.example",
    ]);
  });

  it("reveals Not mine rows but not inferred engine exclusions", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 1000);
    const quotedRef = insertFinding("m1", "email", "quoted@acme.example", 1);
    const plainRef = insertFinding("m1", "email", "plain@acme.example");
    suppressPiiFinding(plainRef);

    const summary = getVendorPiiSummary(vid);
    expect(summary.values).toHaveLength(0);
    expect(summary.suppressedValues).toHaveLength(1);
    expect(revealVendorPiiValues(vid)).toEqual([
      { ref: plainRef, value: "plain@acme.example" },
    ]);
    expect(quotedRef).toBeGreaterThan(0);
  });

  it("is scoped to the queried vendor", () => {
    const a = insertVendor("acme.com");
    const b = insertVendor("other.com");
    insertMsg("m1", a, 1000);
    insertMsg("m2", b, 1000);
    insertFinding("m1", "email", "a@acme.example");
    insertFinding("m2", "email", "b@other.example");

    expect(revealVendorPiiValues(a).map((r) => r.value)).toEqual(["a@acme.example"]);
  });
});

describe("engine flags are excluded like quoted text", () => {
  it("drops footer and self-reference findings from the summary and the reveal", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "address", "4 sample street exampleton sw1a 1aa", 0, { footer: 1 });
    insertFinding("m1", "email", "support@acme.com", 0, { selfReference: 1 });
    insertFinding("m1", "email", "alex@personal.example");

    const values = getVendorPiiSummary(vid).values;
    expect(values.map((v) => v.type)).toEqual(["email"]);
    expect(revealVendorPiiValues(vid).map((r) => r.value)).toEqual(["alex@personal.example"]);
  });
});

describe("company footer evidence", () => {
  it("hides an address when the same company has established it as footer data", () => {
    const vid = insertVendor("templates.example");
    insertMsg("plain-template", vid, 1000);
    insertMsg("footer-template", vid, 2000);
    insertFinding(
      "plain-template",
      "address",
      "4 sample street exampleton sw1a 1aa",
    );
    insertFinding(
      "footer-template",
      "address",
      "4 sample street exampleton sw1a 1aa",
      0,
      { footer: 1 },
    );

    expect(getVendorPiiSummary(vid).values).toHaveLength(0);
    expect(revealVendorPiiValues(vid)).toHaveLength(0);
  });

  it("shares footer evidence across regional vendors for one company", () => {
    const local = insertVendor("example.nl");
    const regional = insertVendor("example.com");
    getDb()
      .prepare(
        "UPDATE vendors SET company_slug = 'example' WHERE id IN (?, ?)",
      )
      .run(local, regional);
    insertMsg("local", local, 1000);
    insertMsg("regional", regional, 2000);
    insertFinding("local", "phone", "+31201234567");
    insertFinding("regional", "phone", "+31201234567", 0, { footer: 1 });

    expect(getVendorPiiSummary(local).values).toHaveLength(0);
  });

  it("does not apply one company's footer evidence to another company", () => {
    const first = insertVendor("first.example");
    const second = insertVendor("second.example");
    insertMsg("first", first, 1000);
    insertMsg("second", second, 2000);
    insertFinding("first", "address", "4 sample street exampleton");
    insertFinding("second", "address", "4 sample street exampleton", 0, {
      footer: 1,
    });

    expect(getVendorPiiSummary(first).values).toHaveLength(1);
  });

  it("does not hide identifiers or user email merely because they appeared in a footer", () => {
    const vid = insertVendor("account.example");
    insertMsg("body", vid, 1000);
    insertMsg("footer", vid, 2000);
    insertFinding("body", "email", "alex@personal.example");
    insertFinding("footer", "email", "alex@personal.example", 0, {
      footer: 1,
    });

    expect(getVendorPiiSummary(vid).values.map((value) => value.type)).toEqual([
      "email",
    ]);
  });
});

describe("profile assertions override inferred exclusions", () => {
  it("un-hides profile matches in quoted text, footers and self references", () => {
    insertProfileMatch("email", "quoted@personal.example");
    insertProfileMatch("address", "4 sample street exampleton");
    insertProfileMatch("phone", "+31612345678");
    const vid = insertVendor();
    insertMsg("quoted", vid, 1000);
    insertMsg("footer", vid, 2000);
    insertMsg("self", vid, 3000);
    insertFinding("quoted", "email", "quoted@personal.example", 1);
    insertFinding("footer", "address", "4 sample street exampleton", 0, {
      footer: 1,
    });
    insertFinding("self", "phone", "+31612345678", 0, {
      selfReference: 1,
    });

    expect(getVendorPiiSummary(vid).values).toEqual([
      expect.objectContaining({ type: "phone", isMatch: true }),
      expect.objectContaining({ type: "address", isMatch: true }),
      expect.objectContaining({ type: "email", isMatch: true }),
    ]);
    expect(revealVendorPiiValues(vid)).toHaveLength(3);
  });

  it("does not infer a match from a vendor address at query time", () => {
    const vid = insertVendor("acme.com", "alias@personal.example");
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "alias@personal.example");

    expect(getVendorPiiSummary(vid).values[0].isMatch).toBeUndefined();
  });
});

describe("spread rule — a value the company repeats at itself", () => {
  // n messages for the vendor, the value appearing in `hits` of them.
  function vendorWith(hits: number, total: number, type: PiiType = "address"): number {
    const vid = insertVendor(`spread${total}-${hits}-${type}.com`);
    for (let i = 0; i < total; i++) {
      const id = `${type}-${total}-${hits}-m${i}`;
      insertMsg(id, vid, 1000 + i);
      if (i < hits) insertFinding(id, type, "4 sample street exampleton");
    }
    return vid;
  }

  it("keeps a value below both thresholds", () => {
    // 4 of 10 is 40% but only four messages — under the count bar.
    expect(getVendorPiiSummary(vendorWith(4, 10)).values).toHaveLength(1);
  });

  it("drops a value at or over the share threshold", () => {
    // 5 of 10: five messages and half the mail.
    expect(getVendorPiiSummary(vendorWith(5, 10)).values).toHaveLength(0);
  });

  it("keeps a value that is frequent but a small share", () => {
    expect(getVendorPiiSummary(vendorWith(10, 100)).values).toHaveLength(1);
  });

  it("drops a value on the absolute threshold even at a small share", () => {
    // 20 of 200 is 10% — under the share bar, over the absolute one. This is
    // the branch the Microsoft HQ (108x) and the 56/215 phone number need.
    expect(getVendorPiiSummary(vendorWith(20, 200)).values).toHaveLength(0);
  });

  it("applies to phones as well as addresses", () => {
    expect(getVendorPiiSummary(vendorWith(20, 200, "phone")).values).toHaveLength(0);
  });

  it("keeps a repeated value when it is in the profile", () => {
    insertProfileMatch("address", "4 sample street exampleton");
    const [value] = getVendorPiiSummary(vendorWith(20, 200)).values;

    expect(value).toEqual(expect.objectContaining({
      type: "address",
      isMatch: true,
    }));
  });

  it("never drops an email, however often the company repeats it", () => {
    // The address a company mails the user at is in every message it sends;
    // repetition is the point. self_reference and in_footer remove the
    // organizational ones before this rule ever sees them.
    const vid = insertVendor("mailer.com");
    for (let i = 0; i < 60; i++) {
      insertMsg(`own-m${i}`, vid, 1000 + i);
      insertFinding(`own-m${i}`, "email", "alex@personal.example");
    }
    const [value] = getVendorPiiSummary(vid).values;
    expect(value?.type).toBe("email");
    expect(revealVendorPiiValues(vid)).toHaveLength(1);
  });

  it("hides a dropped value from the reveal path too", () => {
    const vid = vendorWith(20, 200);
    expect(revealVendorPiiValues(vid)).toHaveLength(0);
  });
});

describe("getPiiOverview — every company at once", () => {
  it("merges a value held by several companies into one row", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 200);
    insertFinding("m1", "iban", "NL91ABNA0417164300");
    insertFinding("m2", "iban", "NL91ABNA0417164300");

    const { values } = getPiiOverview();
    expect(values).toHaveLength(1);
    expect(values[0]).toEqual(
      expect.objectContaining({
        type: "iban",
        maskedValue: "NL •••• 4300",
        companyCount: 2,
        lastSeen: 200, // the most recent sighting, whichever company it was at
      }),
    );
  });

  it("lists a value each company holds separately as its own row", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 100);
    insertFinding("m1", "email", "alex@personal.example");
    insertFinding("m2", "phone", "+31612345678");

    expect(getPiiOverview().values.map((v) => v.type).sort()).toEqual([
      "email",
      "phone",
    ]);
  });

  it("never returns a raw or normalized value", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "iban", "NL91ABNA0417164300");

    expect(JSON.stringify(getPiiOverview())).not.toContain("NL91ABNA0417164300");
  });

  it("applies the same exclusions as a company's own panel", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "phone", "+31611111111", 1); // quoted
    insertFinding("m1", "address", "4 sample street exampleton", 0, { footer: 1 });
    insertFinding("m1", "email", "support@acme.com", 0, { selfReference: 1 });
    const suppressed = insertFinding("m1", "email", "alex@personal.example");
    suppressPiiFinding(suppressed);

    expect(getPiiOverview().values).toHaveLength(0);
    // The engine's exclusions are absolute; the user's own correction is not —
    // it moves the value to the Not mine list rather than out of reach.
    expect(getPiiOverview().suppressedValues.map((v) => v.type)).toEqual([
      "email",
    ]);
  });

  it("hides a value one company repeats at itself, and keeps it where another holds it normally", () => {
    // The spread rule runs per company, before the merge — so boilerplate stays
    // hidden at the company that repeats it without erasing the value from a
    // company that mentions it once.
    const noisy = insertVendor("noisy.com");
    for (let i = 0; i < 20; i++) {
      insertMsg(`noisy-${i}`, noisy, 1000 + i);
      insertFinding(`noisy-${i}`, "address", "4 sample street exampleton");
    }
    expect(getPiiOverview().values).toHaveLength(0);

    const quiet = insertVendor("quiet.com");
    insertMsg("quiet-1", quiet, 2000);
    insertFinding("quiet-1", "address", "4 sample street exampleton");

    expect(getPiiOverview().values.map((v) => v.type)).toEqual(["address"]);
  });

  it("labels a profile value in the mailbox-wide overview", () => {
    insertProfileMatch("email", "alex+acme@owndomain.example");
    const other = insertVendor("other.com");
    insertMsg("m1", other, 100);
    insertFinding("m1", "email", "alex+acme@owndomain.example");

    expect(getPiiOverview().values[0].isMatch).toBe(true);
  });

  it("keeps the same value under different types apart", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "1012ab");
    insertFinding("m1", "postal_code", "1012ab");

    expect(getPiiOverview().values).toHaveLength(2);
  });
});

describe("getPiiValueCompanies — what a Personal Data row expands to", () => {
  it("lists the companies holding a value, most recent contact first", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 900);
    insertFinding("m1", "phone", "+31612345678");
    insertFinding("m2", "phone", "+31612345678");

    const { ref } = getPiiOverview().values[0];
    expect(getPiiValueCompanies(ref)).toEqual([
      { groupKey: "b.com", name: "b.com", lastSeen: 900 },
      { groupKey: "a.com", name: "a.com", lastSeen: 100 },
    ]);
  });

  it("dates a company by its last contact, not the last sighting of the value", () => {
    // The question the list answers is "are they still active?", so a company
    // that stopped printing the value but still mails weekly reads as recent.
    const vid = insertVendor("chatty.com");
    insertMsg("old-with-value", vid, 100);
    insertMsg("recent-without-value", vid, 5000);
    insertFinding("old-with-value", "phone", "+31612345678");

    const { ref } = getPiiOverview().values[0];
    expect(getPiiValueCompanies(ref)[0].lastSeen).toBe(5000);
  });

  it("flips to oldest contact first", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 900);
    insertFinding("m1", "iban", "NL91ABNA0417164300");
    insertFinding("m2", "iban", "NL91ABNA0417164300");

    const { ref } = getPiiOverview().values[0];
    expect(getPiiValueCompanies(ref, "oldest").map((c) => c.name)).toEqual([
      "a.com",
      "b.com",
    ]);
  });

  it("still lists the companies for a value marked Not mine", () => {
    // The Not mine list expands its rows too, so an accidental correction can be
    // judged against the same evidence that produced it.
    const vid = insertVendor("a.com");
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "phone", "+31612345678");
    suppressPiiFinding(ref);

    expect(getPiiValueCompanies(ref).map((c) => c.name)).toEqual(["a.com"]);
  });

  it("collapses one company's regional vendors into a single entry", () => {
    const nl = insertVendor("example.nl");
    const com = insertVendor("example.com");
    getDb()
      .prepare("UPDATE vendors SET company_slug = 'example' WHERE id IN (?, ?)")
      .run(nl, com);
    insertMsg("m1", nl, 100);
    insertMsg("m2", com, 900);
    insertFinding("m1", "iban", "NL91ABNA0417164300");
    insertFinding("m2", "iban", "NL91ABNA0417164300");

    const { ref, companyCount } = getPiiOverview().values[0];
    expect(companyCount).toBe(1);
    // groupKey resolves the company page, which getVendorDetail matches on
    // company_slug OR root_domain.
    expect(getPiiValueCompanies(ref)).toEqual([
      { groupKey: "example", name: "example.com", lastSeen: 900 },
    ]);
  });

  it("returns at most five, matching the count the row reports", () => {
    for (let i = 0; i < 7; i++) {
      const vid = insertVendor(`company${i}.com`);
      insertMsg(`m${i}`, vid, 100 + i);
      insertFinding(`m${i}`, "iban", "NL91ABNA0417164300");
    }

    const [value] = getPiiOverview().values;
    expect(value.companyCount).toBe(7);
    expect(getPiiValueCompanies(value.ref)).toHaveLength(5);
  });

  it("carries no value back to the renderer", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "iban", "NL91ABNA0417164300");

    const { ref } = getPiiOverview().values[0];
    expect(JSON.stringify(getPiiValueCompanies(ref))).not.toContain(
      "NL91ABNA0417164300",
    );
  });

  it("excludes companies where the finding is hidden", () => {
    const visible = insertVendor("visible.com");
    const quoted = insertVendor("quoted.com");
    insertMsg("m1", visible, 100);
    insertMsg("m2", quoted, 900);
    insertFinding("m1", "phone", "+31612345678");
    insertFinding("m2", "phone", "+31612345678", 1); // quoted — a third party's

    const { ref } = getPiiOverview().values[0];
    expect(getPiiValueCompanies(ref).map((c) => c.name)).toEqual(["visible.com"]);
  });

  it("rejects a reference that no longer resolves", () => {
    expect(() => getPiiValueCompanies(999_999)).toThrow(/no longer available/);
  });
});

describe("revealPiiValues", () => {
  it("returns full values keyed by the refs the overview handed out", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 200);
    insertFinding("m1", "email", "alex@personal.example");
    insertFinding("m2", "email", "alex@personal.example");
    insertFinding("m2", "iban", "NL91ABNA0417164300");

    const { values } = getPiiOverview();
    const revealed = revealPiiValues();

    expect(revealed).toHaveLength(values.length);
    const byRef = new Map(revealed.map((r) => [r.ref, r.value]));
    for (const value of values) expect(byRef.get(value.ref)).toBeDefined();
    expect([...byRef.values()].sort()).toEqual([
      "NL91ABNA0417164300",
      "alex@personal.example",
    ]);
  });

  it("reveals what a list shows and nothing more", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "phone", "+31611111111", 1); // quoted: on no list, ever
    const plain = insertFinding("m1", "email", "alex@personal.example");
    suppressPiiFinding(plain);

    // The suppressed value is on the Not mine list, and judging "did I get that
    // one wrong?" needs the value just as much as judging it the first time.
    expect(getPiiOverview().values).toHaveLength(0);
    expect(revealPiiValues().map((r) => r.value)).toEqual(["alex@personal.example"]);
  });

  it("cannot reveal a value the engine excluded", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "phone", "+31611111111", 1);
    insertFinding("m1", "address", "4 sample street exampleton", 0, { footer: 1 });
    insertFinding("m1", "email", "support@acme.com", 0, { selfReference: 1 });

    expect(revealPiiValues()).toHaveLength(0);
  });
});

describe("corrections are global, not per account", () => {
  it("stores corrections in global.db, not in the account database", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    const ref = insertFinding("m1", "email", "a@b.com");
    suppressPiiFinding(ref);

    expect(
      getDb()
        .prepare(
          `SELECT type, value_normalized AS value
           FROM global.pii_suppressions`,
        )
        .all(),
    ).toEqual([
      { type: "email", value: "a@b.com" },
    ]);
    const local = getDb()
      .prepare(
        "SELECT 1 FROM main.sqlite_master WHERE type = 'table' AND name = 'pii_suppressions'",
      )
      .get();
    expect(local).toBeUndefined();
  });
});

describe("Not mine is a list, not a deletion", () => {
  it("moves a value to Not mine, then confirms it into the profile", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "alex@personal.example");

    const { ref } = getPiiOverview().values[0];
    suppressPiiFinding(ref);

    expect(getPiiOverview().values).toHaveLength(0);
    const [marked] = getPiiOverview().suppressedValues;
    // Same row and opaque ref: the Not mine list can deliberately confirm it.
    expect(marked).toEqual(
      expect.objectContaining({ ref, type: "email", maskedValue: "a•••@•••.example" }),
    );

    expect(confirmPiiFinding(marked.ref)).toBe(true);
    expect(getPiiOverview().suppressedValues).toHaveLength(0);
    expect(getPiiOverview().values).toEqual([
      expect.objectContaining({ ref, isMatch: true }),
    ]);
  });

  it("keeps the engine's exclusions out of the suppressed list", () => {
    // A quoted finding was never the user's to reject, so marking something else
    // must not drag it onto the Not mine list.
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "phone", "+31611111111", 1);
    const ref = insertFinding("m1", "email", "alex@personal.example");
    suppressPiiFinding(ref);

    expect(getPiiOverview().suppressedValues.map((v) => v.type)).toEqual([
      "email",
    ]);
  });

  it("reports the same company spread as the overview did", () => {
    const a = insertVendor("a.com");
    const b = insertVendor("b.com");
    insertMsg("m1", a, 100);
    insertMsg("m2", b, 100);
    insertFinding("m1", "phone", "+31612345678");
    insertFinding("m2", "phone", "+31612345678");

    const { ref, companyCount } = getPiiOverview().values[0];
    suppressPiiFinding(ref);
    expect(companyCount).toBe(2);
    expect(getPiiOverview().suppressedValues[0].companyCount).toBe(2);
  });
});

describe("locale and cross-company facts", () => {
  it("infers the initial country while runtime views use the stored country", () => {
    const first = insertVendor("first.example");
    const second = insertVendor("second.example");
    const noisy = insertVendor("network.example");
    insertMsg("first-phone", first, 1000);
    insertMsg("second-phone", second, 1000);
    insertMsg("foreign-phone", noisy, 1000);
    insertFinding("first-phone", "phone", "+31610000001", 0, { country: "NL" });
    insertFinding("second-phone", "phone", "+31610000001", 0, { country: "NL" });
    insertFinding("foreign-phone", "phone", "+919100000001", 0, { country: "IN" });

    expect(inferHomeCountry()).toBe("NL");
    getDb()
      .prepare("UPDATE global.profile SET country = 'DE' WHERE id = 1")
      .run();
    expect(getVendorPiiSummary(noisy).values[0].isForeignFormat).toBe(true);
    expect(getVendorPiiSummary(first).values[0].companyCount).toBe(2);
    expect(getVendorPiiSummary(noisy).values[0].companyCount).toBe(1);
    expect(revealVendorPiiValues(noisy)).toEqual([
      expect.objectContaining({ value: "+919100000001" }),
    ]);
  });

  it("does not count regional vendor rows for one company as separate evidence", () => {
    const first = insertVendor("example.nl");
    const second = insertVendor("example.be");
    getDb().prepare("UPDATE vendors SET company_slug = 'example' WHERE id IN (?, ?)").run(
      first,
      second,
    );
    insertMsg("regional-1", first, 1000);
    insertMsg("regional-2", second, 1000);
    insertFinding("regional-1", "phone", "+31610000002", 0, { country: "NL" });
    insertFinding("regional-2", "phone", "+31610000002", 0, { country: "NL" });

    expect(inferHomeCountry()).toBeUndefined();
  });

  it("keeps repeated identifiers visible and reports their company spread", () => {
    const first = insertVendor("invoice.example");
    const second = insertVendor("other.example");
    for (let i = 0; i < 20; i++) {
      insertMsg(`invoice-${i}`, first, 1000 + i);
      insertFinding(`invoice-${i}`, "iban", "NL91ABNA0417164300", 0, {
        country: "NL",
      });
    }
    insertMsg("other-iban", second, 1000);
    insertFinding("other-iban", "iban", "NL91ABNA0417164300", 0, {
      country: "NL",
    });

    const [value] = getVendorPiiSummary(first).values;
    expect(value).toEqual(
      expect.objectContaining({
        type: "iban",
        companyCount: 2,
        isFrequentAtCompany: true,
      }),
    );
  });

  it("keeps a repeated single-company identifier visible as a demotion fact", () => {
    const vendor = insertVendor("invoice.example");
    for (let i = 0; i < 20; i++) {
      insertMsg(`sender-iban-${i}`, vendor, 1000 + i);
      insertFinding(`sender-iban-${i}`, "iban", "NL91ABNA0417164300", 0, {
        country: "NL",
      });
    }

    const [value] = getVendorPiiSummary(vendor).values;
    expect(value).toEqual(
      expect.objectContaining({
        type: "iban",
        companyCount: 1,
        isFrequentAtCompany: true,
      }),
    );
  });
});
