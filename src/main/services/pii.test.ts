jest.mock("../credentials", () => ({
  emailToFileKey: jest.fn(),
  listAccounts: jest.fn(() => [] as Array<{ email: string }>),
}));
jest.mock("../utils/log", () => {
  const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { dbLog: l, syncLog: l, appLog: l };
});

import { getDb, initDb } from "../db";
import { listAccounts } from "../credentials";
import {
  getVendorPiiSummary,
  inferHomeCountry,
  maskValue,
  revealVendorPiiValues,
  suppressPiiFinding,
  unsuppressPiiFinding,
} from "./pii";
import type { PiiType } from "@shared/types";

const mockListAccounts = listAccounts as jest.MockedFunction<typeof listAccounts>;

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

beforeAll(() => initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent"));
beforeEach(() => {
  mockListAccounts.mockReturnValue([]);
  getDb().exec(
    "DELETE FROM pii_findings; DELETE FROM pii_suppressions; DELETE FROM messages; DELETE FROM vendors;",
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

describe("own addresses", () => {
  it("labels a connected account address", () => {
    mockListAccounts.mockReturnValue([
      { email: "User@Example.com", providerType: "gmail" },
    ]);
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "user@example.com");

    expect(getVendorPiiSummary(vid).values[0].isOwnAddress).toBe(true);
  });

  it("labels the alias this company mails the user at", () => {
    const vid = insertVendor("acme.com", "acme-alias@icloud.com");
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "acme-alias@icloud.com");

    expect(getVendorPiiSummary(vid).values[0].isOwnAddress).toBe(true);
  });

  it("leaves someone else's address unlabelled", () => {
    mockListAccounts.mockReturnValue([
      { email: "user@example.com", providerType: "gmail" },
    ]);
    const vid = insertVendor("acme.com", "acme-alias@icloud.com");
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "support@acme.com");

    expect(getVendorPiiSummary(vid).values[0].isOwnAddress).toBeUndefined();
  });

  it("does not label a non-email finding that happens to match", () => {
    mockListAccounts.mockReturnValue([
      { email: "user@example.com", providerType: "gmail" },
    ]);
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "address", "user@example.com");

    expect(getVendorPiiSummary(vid).values[0].isOwnAddress).toBeUndefined();
  });
});

describe("coverage", () => {
  it("counts every stored message, and those the engine has analyzed", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100, "v1");
    insertMsg("m2", vid, 200, "v1");
    insertMsg("m3", vid, 300); // stored, not yet analyzed

    expect(getVendorPiiSummary(vid).coverage).toEqual({
      totalMessages: 3,
      scannedMessages: 2,
    });
  });

  it("counts messages analyzed by an older engine as scanned", () => {
    // The summary doesn't filter findings by engine version, so coverage must
    // not either — otherwise a version bump reports 0 scanned while the values
    // that bump has yet to refresh are still on screen.
    const vid = insertVendor();
    insertMsg("m1", vid, 100, "v0-old");
    expect(getVendorPiiSummary(vid).coverage.scannedMessages).toBe(1);
  });

  it("reports zero for a company with nothing scanned", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    expect(getVendorPiiSummary(vid).coverage).toEqual({
      totalMessages: 1,
      scannedMessages: 0,
    });
  });
});

describe("suppression by opaque reference", () => {
  it("hides the value the reference resolves to, and restores it on undo", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 100);
    insertFinding("m1", "email", "a@b.com");

    const { ref } = getVendorPiiSummary(vid).values[0];
    suppressPiiFinding(ref);
    expect(getVendorPiiSummary(vid).values).toHaveLength(0);

    // The finding row itself is untouched, so the same handle still resolves.
    unsuppressPiiFinding(ref);
    expect(getVendorPiiSummary(vid).values).toHaveLength(1);
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
    const n = (getDb().prepare("SELECT COUNT(*) n FROM pii_suppressions").get() as { n: number }).n;
    expect(n).toBe(1);
  });

  it("rejects a reference that no longer resolves", () => {
    // Re-analysis replaces a message's findings, so ids change under a handle
    // the renderer is still holding. Fail loudly — the caller refetches.
    expect(() => suppressPiiFinding(999_999)).toThrow(/no longer available/);
    expect(() => unsuppressPiiFinding(999_999)).toThrow(/no longer available/);
  });
});

describe("revealVendorPiiValues", () => {
  it("returns full values keyed by the same refs the summary handed out", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "someone@acme.example");
    insertFinding("m1", "iban", "NL91ABNA0417164300");

    const summary = getVendorPiiSummary(vid);
    const revealed = revealVendorPiiValues(vid);

    expect(revealed).toHaveLength(summary.values.length);
    const byRef = new Map(revealed.map((r) => [r.ref, r.value]));
    for (const v of summary.values) expect(byRef.get(v.ref)).toBeDefined();
    expect([...byRef.values()].sort()).toEqual([
      "NL91ABNA0417164300",
      "someone@acme.example",
    ]);
  });

  it("cannot reveal what the summary hides", () => {
    const vid = insertVendor();
    insertMsg("m1", vid, 1000);
    const quotedRef = insertFinding("m1", "email", "quoted@acme.example", 1);
    const plainRef = insertFinding("m1", "email", "plain@acme.example");
    suppressPiiFinding(plainRef);

    // One finding is quoted, the other suppressed — nothing is on screen, so
    // nothing is revealable.
    expect(getVendorPiiSummary(vid).values).toHaveLength(0);
    expect(revealVendorPiiValues(vid)).toHaveLength(0);
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

describe("own-address labelling", () => {
  const summaryFor = (vid: number) => getVendorPiiSummary(vid).values[0];

  it("labels a connected account and a plus-alias of it", () => {
    mockListAccounts.mockReturnValue([{ email: "alice@owndomain.example" }] as never);
    const vid = insertVendor();
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "alice+shop@owndomain.example");

    expect(summaryFor(vid)?.isOwnAddress).toBe(true);
  });

  it("labels a plus-alias of the address this company mails them at", () => {
    mockListAccounts.mockReturnValue([]);
    const vid = insertVendor("acme.com", "alex+acme@owndomain.example");
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "alex+newsletter@owndomain.example");

    expect(summaryFor(vid)?.isOwnAddress).toBe(true);
  });

  it("labels a whole domain the user evidently owns", () => {
    mockListAccounts.mockReturnValue([]);
    // Three companies each mail a different local part at one domain — that is
    // a catch-all the user controls.
    insertVendor("shop.com", "shop@owndomain.example");
    insertVendor("bank.com", "bank@owndomain.example");
    insertVendor("gym.com", "gym@owndomain.example");
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "something-else@owndomain.example");

    expect(summaryFor(vid)?.isOwnAddress).toBe(true);
  });

  it("does not turn a public webmail domain into the user's own", () => {
    // The counter-case the rule exists for: three old gmail addresses must not
    // make every gmail address in the mailbox the user's.
    mockListAccounts.mockReturnValue([{ email: "alice@gmail.com" }] as never);
    insertVendor("shop.com", "alice@gmail.com");
    insertVendor("bank.com", "alice.b@gmail.com");
    insertVendor("gym.com", "alice.old@gmail.com");
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "someone.else@gmail.com");

    expect(summaryFor(vid)?.isOwnAddress).toBeUndefined();
  });

  it("needs three distinct local parts, and plus-aliases do not count", () => {
    mockListAccounts.mockReturnValue([]);
    insertVendor("shop.com", "alex+shop@owndomain.example");
    insertVendor("bank.com", "alex+bank@owndomain.example");
    insertVendor("gym.com", "alex+gym@owndomain.example");
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, 1000);
    insertFinding("m1", "email", "stranger@owndomain.example");

    // One mailbox spelled three ways is not a domain the user owns.
    expect(summaryFor(vid)?.isOwnAddress).toBeUndefined();
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

  it("never drops an email, however often the company repeats it", () => {
    // The address a company mails the user at is in every message it sends;
    // repetition is the point. self_reference and in_footer remove the
    // organizational ones before this rule ever sees them.
    mockListAccounts.mockReturnValue([{ email: "alex@personal.example" }] as never);
    const vid = insertVendor("mailer.com");
    for (let i = 0; i < 60; i++) {
      insertMsg(`own-m${i}`, vid, 1000 + i);
      insertFinding(`own-m${i}`, "email", "alex@personal.example");
    }
    const [value] = getVendorPiiSummary(vid).values;
    expect(value?.isOwnAddress).toBe(true);
    expect(revealVendorPiiValues(vid)).toHaveLength(1);
  });

  it("hides a dropped value from the reveal path too", () => {
    const vid = vendorWith(20, 200);
    expect(revealVendorPiiValues(vid)).toHaveLength(0);
  });
});

describe("locale and cross-company facts", () => {
  it("infers home country only from an exact value seen across companies", () => {
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
