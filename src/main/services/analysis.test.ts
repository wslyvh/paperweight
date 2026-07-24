jest.mock("../credentials", () => ({ emailToFileKey: jest.fn() }));
jest.mock("../utils/log", () => {
  const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { dbLog: l, syncLog: l, appLog: l };
});
// The real engine imports ESM (htmlparser2/franc) the CJS jest runner can't load;
// detection itself is covered by the analysis vitest suite. Here we stub it and
// verify only the persistence/version wiring.
jest.mock("@paperweight/analysis", () => ({
  ENGINE_VERSION: "test-v1",
  analyzeText: jest.fn(),
  analyzeMessage: jest.fn(),
  regionFromDomain: jest.fn(),
  // Catalogue matching is the engine's call; its own suite covers the
  // comparison. Here it stays off unless a test opts in.
  isSenderContact: jest.fn(() => false),
}));

import {
  analyzeMessage,
  analyzeText,
  isSenderContact,
  regionFromDomain,
  ENGINE_VERSION,
} from "@paperweight/analysis";
import type { Analysis, Finding, RawMessage } from "@paperweight/analysis";
import { BODY_TEXT_MAX_LENGTH } from "@shared/config";
import { getDb, initDb } from "../db";
import { persistFindings, runAnalysisPass, runReclassifyPass } from "./analysis";

const mockAnalyze = analyzeText as jest.MockedFunction<typeof analyzeText>;
const mockAnalyzeMessage = analyzeMessage as jest.MockedFunction<typeof analyzeMessage>;
const mockRegion = regionFromDomain as jest.MockedFunction<typeof regionFromDomain>;
const mockIsSenderContact = isSenderContact as jest.MockedFunction<typeof isSenderContact>;

function finding(over: Partial<Finding> = {}): Finding {
  return {
    type: "email",
    valueRaw: "a@b.com",
    valueNormalized: "a@b.com",
    start: 0,
    end: 7,
    confidence: "pattern",
    signals: [],
    ...over,
  };
}

const resolveWith = (findings: Finding[]) =>
  mockAnalyze.mockResolvedValue({ version: ENGINE_VERSION, lang: "eng", findings });

function insertVendor(companySlug?: string): number {
  return Number(
    getDb()
      .prepare(
        "INSERT INTO vendors (root_domain, name, company_slug) VALUES ('acme.com', 'Acme', ?)",
      )
      .run(companySlug ?? null).lastInsertRowid,
  );
}

function insertMsg(
  id: string,
  vid: number,
  o: {
    body_state?: string;
    body_text?: string | null;
    analysis_version?: string | null;
    sender?: string;
    unsubscribeMethod?: string;
  } = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO messages (
         id, vendor_id, sender_email, date, body_state, body_text,
         analysis_version, unsubscribe_method
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      vid,
      o.sender ?? "hello@acme.com",
      1_700_000_000_000,
      o.body_state ?? "available",
      o.body_text === undefined ? "some body text" : o.body_text,
      o.analysis_version ?? null,
      o.unsubscribeMethod ?? "none",
    );
}

const findingsOf = (id: string) =>
  getDb().prepare("SELECT * FROM pii_findings WHERE message_id = ?").all(id) as Array<Record<string, unknown>>;
const versionOf = (id: string) =>
  (getDb().prepare("SELECT analysis_version v FROM messages WHERE id = ?").get(id) as { v: string | null }).v;

beforeAll(() => {
  initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent");
  const d = getDb();
  d.exec(`
    ATTACH DATABASE ':memory:' AS companies;
    CREATE TABLE companies.companies (
      slug TEXT PRIMARY KEY,
      address TEXT,
      phone TEXT
    );
  `);
});
beforeEach(() => {
  getDb().exec(
    "DELETE FROM pii_findings; DELETE FROM messages; DELETE FROM vendors; DELETE FROM settings; DELETE FROM companies.companies;",
  );
  mockAnalyze.mockReset();
  mockAnalyzeMessage.mockReset();
  mockRegion.mockReset();
  mockIsSenderContact.mockReset();
  mockIsSenderContact.mockReturnValue(false);
});

describe("runAnalysisPass", () => {
  it("persists mapped findings and stamps analysis_version", async () => {
    const vid = insertVendor();
    insertMsg("m1", vid);
    resolveWith([finding({ type: "iban", valueRaw: "NL91 ABNA 0417 1643 00", valueNormalized: "NL91ABNA0417164300", start: 5, end: 27, confidence: "verified", country: "NL", inQuotedText: false })]);

    const n = await runAnalysisPass();

    expect(n).toBe(1);
    const rows = findingsOf("m1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "iban",
      value_normalized: "NL91ABNA0417164300",
      country: "NL",
      in_quoted_text: 0,
    });
    // The analyzing version is stamped once per message, not per finding.
    expect(versionOf("m1")).toBe("test-v1");
    expect(
      getDb()
        .prepare(
          "SELECT value FROM settings WHERE key = 'analysis:findings-version'",
        )
        .get(),
    ).toEqual({ value: "test-v1" });
  });

  it("stores in_quoted_text as 1 for quoted findings", async () => {
    const vid = insertVendor();
    insertMsg("m2", vid);
    resolveWith([finding({ inQuotedText: true })]);
    await runAnalysisPass();
    expect(findingsOf("m2")[0].in_quoted_text).toBe(1);
  });

  it("skips messages already at the current engine version", async () => {
    const vid = insertVendor();
    insertMsg("m3", vid, { analysis_version: "test-v1" });
    resolveWith([finding()]);
    expect(await runAnalysisPass()).toBe(0);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("skips the message query after the database is marked current", async () => {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("analysis:findings-version", "test-v1");
    const vid = insertVendor();
    insertMsg("marker-skip", vid, { analysis_version: "old-v0" });
    resolveWith([finding()]);

    expect(await runAnalysisPass()).toBe(0);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("re-analyzes messages stamped by an older engine version", async () => {
    const vid = insertVendor();
    insertMsg("m4", vid, { analysis_version: "old-v0" });
    resolveWith([finding()]);
    expect(await runAnalysisPass()).toBe(1);
    expect(versionOf("m4")).toBe("test-v1");
  });

  it("skips messages with no stored body", async () => {
    const vid = insertVendor();
    insertMsg("m5", vid, { body_state: "missing", body_text: null });
    resolveWith([finding()]);
    expect(await runAnalysisPass()).toBe(0);
  });

  it("replaces prior findings rather than appending on re-analysis", async () => {
    const vid = insertVendor();
    insertMsg("m6", vid, { analysis_version: "old-v0" });
    getDb()
      .prepare(
        "INSERT INTO pii_findings (message_id, type, value_normalized, in_quoted_text) VALUES ('m6','phone','x',0)",
      )
      .run();
    resolveWith([finding({ type: "email" })]);

    await runAnalysisPass();
    const rows = findingsOf("m6");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("email");
  });

  it("passes the sender-ccTLD region as the locale hint", async () => {
    const vid = insertVendor();
    insertMsg("m7", vid, { sender: "info@acme.nl" });
    mockRegion.mockReturnValue("NL");
    resolveWith([finding()]);

    await runAnalysisPass();
    expect(mockRegion).toHaveBeenCalledWith("acme.nl");
    // Both hints ride along, the same way analyzeMessage derives them at parse.
    expect(mockAnalyze).toHaveBeenCalledWith("some body text", {
      locale: "NL",
      senderDomain: "acme.nl",
    });
  });

  it("passes the stored footer-link fact to offline finding analysis", async () => {
    const vid = insertVendor();
    insertMsg("footer-fact", vid, { unsubscribeMethod: "footer" });
    resolveWith([]);

    await runAnalysisPass();

    expect(mockAnalyze).toHaveBeenCalledWith("some body text", {
      senderDomain: "acme.com",
      footerLinkPresent: true,
    });
  });

  it("leaves analysis_version unset when analysis throws (retried next pass)", async () => {
    const vid = insertVendor();
    insertMsg("m8", vid);
    mockAnalyze.mockRejectedValue(new Error("boom"));

    const n = await runAnalysisPass();
    expect(n).toBe(0);
    expect(versionOf("m8")).toBeNull();
    expect(findingsOf("m8")).toHaveLength(0);
    expect(
      getDb()
        .prepare(
          "SELECT value FROM settings WHERE key = 'analysis:findings-version'",
        )
        .get(),
    ).toBeUndefined();
  });

  it("caps a stored body before analysis and truncates it atomically", async () => {
    const vid = insertVendor();
    insertMsg("long-body", vid, {
      body_text: "x".repeat(BODY_TEXT_MAX_LENGTH + 10),
    });
    resolveWith([]);

    await runAnalysisPass();

    expect(mockAnalyze.mock.calls[0][0]).toHaveLength(BODY_TEXT_MAX_LENGTH);
    expect(rowOf("long-body")).toMatchObject({
      body_state: "truncated",
      analysis_version: "test-v1",
    });
    expect(String(rowOf("long-body").body_text)).toHaveLength(BODY_TEXT_MAX_LENGTH);
  });
});

describe("sync-time analysis vs the catch-up pass", () => {
  it("never analyzes a body twice — a row stamped at sync time is skipped here", async () => {
    const vid = insertVendor();
    insertMsg("m9", vid, { analysis_version: null });
    // What processMessagesBatch does right after storing a body-bearing row:
    // the engine already ran at provider parse, so findings go straight in and
    // the version stamp lands with them.
    persistFindings("m9", [finding()]);
    expect(versionOf("m9")).toBe("test-v1");

    resolveWith([finding()]);
    expect(await runAnalysisPass()).toBe(0);
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(findingsOf("m9")).toHaveLength(1);
  });

  // The comparison itself belongs to the engine and is covered by its suite.
  // What the app owes it is the context: the right catalogue row for the
  // message's company, the sender's region, and the verdict written to the row.
  it("hands the engine the company's catalogue contacts and stores its verdict", () => {
    getDb()
      .prepare(
        "INSERT INTO companies.companies (slug, address, phone) VALUES (?, ?, ?)",
      )
      .run("acme", "4 Sample Street, Exampleton", "+31 20 100 00 00");
    const vid = insertVendor("acme");
    insertMsg("company-data", vid, { sender: "hello@acme.nl" });
    mockRegion.mockReturnValue("NL");
    mockIsSenderContact.mockImplementation((f: Finding) => f.type === "address");

    persistFindings("company-data", [
      finding({ type: "address", valueNormalized: "4 sample street exampleton" }),
      finding({ type: "phone", valueNormalized: "+31201000000" }),
    ]);

    expect(mockIsSenderContact).toHaveBeenCalledWith(
      expect.objectContaining({ type: "address" }),
      { addresses: ["4 Sample Street, Exampleton"], phones: ["+31 20 100 00 00"] },
      "NL",
    );
    expect(findingsOf("company-data").map((row) => row.self_reference)).toEqual([1, 0]);
  });

  it("does not consult the engine when no catalogue row matches the company", () => {
    const vid = insertVendor();
    insertMsg("no-company", vid);

    persistFindings("no-company", [finding({ type: "address" })]);

    expect(mockIsSenderContact).not.toHaveBeenCalled();
    expect(findingsOf("no-company")[0].self_reference).toBe(0);
  });
});

// --- The one-time switch to the engine's vocabulary ---

const RECLASSIFY_ON = () =>
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:reclassify', '1')")
    .run();

const flag = () =>
  (getDb().prepare("SELECT value v FROM settings WHERE key = 'migration:reclassify'").get() as
    | { v: string }
    | undefined)?.v;

const rowOf = (id: string) =>
  getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown>;

const verdict = (over: Partial<Analysis> = {}): Analysis => ({
  version: "test-v1",
  lang: "eng",
  findings: [],
  text: "",
  type: "promotion",
  typeConfidence: 0.8,
  typeSignals: [],
  ...over,
});

// Headers as the two shapes we have written over time.
const pairsJson = JSON.stringify([["From", "Acme <hello@acme.com>"]]);
const legacyJson = JSON.stringify({ From: "Acme <hello@acme.com>" });

function insertStored(
  id: string,
  vid: number,
  o: {
    raw_headers?: string;
    body_text?: string | null;
    type?: string;
    unsubscribe_url?: string | null;
    unsubscribe_method?: string;
  } = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO messages (id, vendor_id, sender_email, date, raw_headers, body_text, body_state, type, unsubscribe_url, unsubscribe_method)
       VALUES (?, ?, 'hello@acme.com', 1000, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      vid,
      o.raw_headers ?? pairsJson,
      o.body_text === undefined ? null : o.body_text,
      o.body_text ? "available" : "missing",
      o.type ?? "bulk",
      o.unsubscribe_url ?? null,
      o.unsubscribe_method ?? "none",
    );
}

describe("runReclassifyPass", () => {
  it("does nothing unless the migration flag is set", async () => {
    const vid = insertVendor();
    insertStored("r0", vid);
    expect(await runReclassifyPass()).toBe(0);
    expect(mockAnalyzeMessage).not.toHaveBeenCalled();
    expect(rowOf("r0").type).toBe("bulk");
  });

  it("re-derives type from either stored header shape", async () => {
    const vid = insertVendor();
    insertStored("r1", vid, { raw_headers: pairsJson });
    insertStored("r2", vid, { raw_headers: legacyJson, type: "transactional" });
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(verdict({ type: "update" }));

    expect(await runReclassifyPass()).toBe(2);

    expect(rowOf("r1").type).toBe("update");
    expect(rowOf("r2").type).toBe("update");
    // Both shapes reach the engine as From, so its ccTLD locale fallback works
    // without the pass passing a locale of its own.
    for (const call of mockAnalyzeMessage.mock.calls) {
      expect((call[0] as RawMessage).headers["From"]).toBe("Acme <hello@acme.com>");
      expect(call[1]).toEqual({ maxTextLength: BODY_TEXT_MAX_LENGTH });
    }
  });

  it("passes a stored body as text, and omits it when there is none", async () => {
    const vid = insertVendor();
    insertStored("r3", vid, { body_text: "stored body" });
    insertStored("r4", vid, { body_text: null });
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(verdict());

    await runReclassifyPass();

    const sent = mockAnalyzeMessage.mock.calls.map((c) => (c[0] as RawMessage).text);
    expect(sent).toContain("stored body");
    // An empty string would read as "there is a text part" — absent is honest.
    expect(sent).toContain(undefined);
  });

  it("stamps findings and the version only for rows that have a body", async () => {
    const vid = insertVendor();
    insertStored("r5", vid, { body_text: "stored body" });
    insertStored("r6", vid, { body_text: null });
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(verdict({ text: "stored body", findings: [finding()] }));

    await runReclassifyPass();

    expect(findingsOf("r5")).toHaveLength(1);
    expect(versionOf("r5")).toBe("test-v1");
    // Left unstamped on purpose: this is what lets the walk's full fetch analyze it.
    expect(findingsOf("r6")).toHaveLength(0);
    expect(versionOf("r6")).toBeNull();
  });

  it("stores the engine-capped body during the switch pass", async () => {
    const vid = insertVendor();
    insertStored("r-cap", vid, {
      body_text: "x".repeat(BODY_TEXT_MAX_LENGTH + 10),
    });
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(
      verdict({
        text: "x".repeat(BODY_TEXT_MAX_LENGTH),
        textTruncated: true,
      }),
    );

    await runReclassifyPass();

    expect(String(rowOf("r-cap").body_text)).toHaveLength(BODY_TEXT_MAX_LENGTH);
    expect(rowOf("r-cap").body_state).toBe("truncated");
  });

  it("upgrades an unsubscribe target but never clears a stored one", async () => {
    const vid = insertVendor();
    insertStored("r7", vid, {
      unsubscribe_url: "https://acme.com/footer-link",
      unsubscribe_method: "footer",
    });
    insertStored("r8", vid);
    RECLASSIFY_ON();
    // Header-only input: the engine finds no unsubscribe at all.
    mockAnalyzeMessage.mockResolvedValue(verdict());

    await runReclassifyPass();

    // No html to re-derive a footer target from, so the stored one stands.
    expect(rowOf("r7").unsubscribe_url).toBe("https://acme.com/footer-link");
    expect(rowOf("r7").unsubscribe_method).toBe("footer");
    expect(rowOf("r8").unsubscribe_url).toBeNull();
    expect(mockAnalyzeMessage.mock.calls.map((call) => call[1])).toContainEqual({
      maxTextLength: BODY_TEXT_MAX_LENGTH,
      knownUnsubscribe: {
        method: "footer",
        target: "https://acme.com/footer-link",
      },
    });
  });

  it("writes what the engine resolves when it does resolve one", async () => {
    const vid = insertVendor();
    insertStored("r9", vid);
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(
      verdict({ unsubscribe: { method: "rfc8058", target: "https://acme.com/one-click" } }),
    );

    await runReclassifyPass();

    expect(rowOf("r9").unsubscribe_url).toBe("https://acme.com/one-click");
    expect(rowOf("r9").unsubscribe_method).toBe("rfc8058");
  });

  it("recomputes the denormalized vendor flags", async () => {
    const vid = insertVendor();
    insertStored("r10", vid, { type: "bulk" });
    getDb().prepare("UPDATE vendors SET has_marketing = 0, has_account = 1 WHERE id = ?").run(vid);
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(
      verdict({
        type: "promotion",
        unsubscribe: {
          method: "list-unsubscribe",
          target: "https://acme.com/unsubscribe",
        },
      }),
    );

    await runReclassifyPass();

    const v = getDb().prepare("SELECT * FROM vendors WHERE id = ?").get(vid) as Record<string, unknown>;
    expect(v.has_marketing).toBe(1);
    expect(v.has_account).toBe(0);
  });

  it("clears the flag on completion, so a second launch is a no-op", async () => {
    const vid = insertVendor();
    insertStored("r11", vid);
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(
      verdict({
        type: "promotion",
        unsubscribe: {
          method: "footer",
          target: "https://acme.com/unsubscribe",
        },
      }),
    );

    expect(await runReclassifyPass()).toBe(1);
    expect(flag()).toBe("0");

    mockAnalyzeMessage.mockClear();
    expect(await runReclassifyPass()).toBe(0);
    expect(mockAnalyzeMessage).not.toHaveBeenCalled();
    expect(rowOf("r11").type).toBe("promotion");
  });

  it("re-running the pass over its own output changes nothing", async () => {
    const vid = insertVendor();
    insertStored("r12", vid, { body_text: "stored body" });
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockResolvedValue(verdict({ text: "stored body", findings: [finding()] }));

    await runReclassifyPass();
    const first = rowOf("r12");

    RECLASSIFY_ON();
    await runReclassifyPass();

    expect(rowOf("r12")).toEqual(first);
    expect(findingsOf("r12")).toHaveLength(1);
  });

  it("parks an unreadable row at 'unknown' rather than leaving a dead value", async () => {
    const vid = insertVendor();
    insertStored("r13", vid, { type: "bulk" });
    RECLASSIFY_ON();
    mockAnalyzeMessage.mockRejectedValue(new Error("boom"));

    expect(await runReclassifyPass()).toBe(0);
    expect(rowOf("r13").type).toBe("unknown");
    expect(flag()).toBe("0");
  });
});
