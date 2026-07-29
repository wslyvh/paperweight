jest.mock("../utils/log", () => ({
  dbLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../credentials", () => ({ emailToFileKey: jest.fn() }));

import { getDb, initDb } from "../db";
import {
  getMessageById,
  getMessageIdsByVendor,
  insertMessageVendor,
  MESSAGE_COLUMNS,
} from "./messages";
import { parseHeaderPairs } from "@shared/utils";
import { MARKETING_ACTION_TYPES } from "@shared/types";
import type { EmailMessage } from "../providers/types";
import type { Analysis } from "@paperweight/analysis";

function insertVendor(rootDomain: string): number {
  const result = getDb()
    .prepare("INSERT INTO vendors (root_domain, name) VALUES (?, ?)")
    .run(rootDomain, rootDomain);
  return Number(result.lastInsertRowid);
}

interface RawMessageRow {
  id: string;
  raw_headers: string | null;
  body_text: string | null;
  body_state: string;
  status: string | null;
  unsubscribe_url: string | null;
  vendor_id: number;
}

const rawRow = (id: string): RawMessageRow =>
  getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as RawMessageRow;

// Every column, for the merge tests below: the walk re-visits stored ids, so
// what the upsert leaves alone matters as much as what it fills.
const wholeRow = (id: string): Record<string, unknown> =>
  getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown>;

const changedColumns = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] => Object.keys(before).filter((c) => before[c] !== after[c]).sort();

// Ordered [name, value] pairs — matches what the providers now serialize.
const headerPairs = (pairs: Array<[string, string]>): string => JSON.stringify(pairs);

// The engine's verdict, as the providers now attach it. Detection itself is the
// analysis vitest suite's job; here it is fixture data.
const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  version: "test-v1",
  lang: "eng",
  findings: [],
  text: "",
  type: "unknown",
  typeConfidence: 0,
  typeSignals: [],
  ...over,
});

function fullMessage(id: string, overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id,
    date: 1_700_000_000_000,
    subject: "Order confirmation",
    snippet: "",
    senderEmail: "hello@acme.com",
    senderName: "Acme",
    headersJson: headerPairs([
      ["From", "Acme <hello@acme.com>"],
      ["To", "user@example.com"],
      ["Received", "from a.acme.com"],
      ["Received", "from b.acme.com"],
    ]),
    sizeBytes: 2048,
    analysis: analysis({
      text: "Thanks for your order\n\nShip to: 10 Downing Street",
      type: "purchase",
    }),
    ...overrides,
  };
}

// A fetch that produced no body text — what a re-visit sees for a row stored
// before this release, and what an empty message looks like now.
function bodylessMessage(id: string, overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id,
    date: 1_700_000_000_000,
    subject: "Order confirmation",
    snippet: "",
    senderEmail: "hello@acme.com",
    senderName: "Acme",
    headersJson: headerPairs([["From", "Acme <hello@acme.com>"]]),
    sizeBytes: 0,
    analysis: analysis({ type: "promotion" }),
    ...overrides,
  };
}

beforeAll(() => {
  initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent");
});

beforeEach(() => {
  getDb().exec("DELETE FROM messages; DELETE FROM vendors;");
});

describe("insertMessageVendor — body storage", () => {
  it("stores full block-structured body with body_state 'available' and lossless headers", () => {
    const vid = insertVendor("acme.com");
    insertMessageVendor(fullMessage("m1"), vid);

    const row = rawRow("m1");
    expect(row.body_text).toBe("Thanks for your order\n\nShip to: 10 Downing Street");
    expect(row.body_state).toBe("available");

    // Duplicate Received headers are preserved in order — losslessness.
    const pairs = parseHeaderPairs(row.raw_headers);
    expect(pairs.filter(([k]) => k === "Received")).toHaveLength(2);
    expect(pairs.map(([k]) => k)).toEqual(["From", "To", "Received", "Received"]);
  });

  it("stores a fetch-capped body as body_state 'truncated'", () => {
    const vid = insertVendor("acme.com");
    insertMessageVendor(fullMessage("mt", { bodyTruncated: true }), vid);

    const row = rawRow("mt");
    expect(row.body_state).toBe("truncated");
    expect(row.body_text).toContain("Ship to");

    // A later body-less fetch must not downgrade a truncated body either.
    insertMessageVendor(bodylessMessage("mt"), vid);
    expect(rawRow("mt").body_state).toBe("truncated");
  });

  it("marks a body-less fetch as body_state 'missing' with no body_text", () => {
    const vid = insertVendor("acme.com");
    insertMessageVendor(bodylessMessage("m2"), vid);

    const row = rawRow("m2");
    expect(row.body_text).toBeNull();
    expect(row.body_state).toBe("missing");
  });

  it("never exposes body_text/body_state via the renderer-facing selection", () => {
    const vid = insertVendor("acme.com");
    insertMessageVendor(fullMessage("m3"), vid);

    expect(MESSAGE_COLUMNS).not.toMatch(/body_text|body_state|analysis_version/);
    const message = getMessageById("m3") as Record<string, unknown>;
    expect(message).toBeDefined();
    expect("body_text" in message).toBe(false);
    expect("body_state" in message).toBe(false);
    expect("analysis_version" in message).toBe(false);
  });
});

describe("insertMessageVendor — upsert on overlap re-sync", () => {
  it("reports a new full capture as changed", () => {
    const vid = insertVendor("acme.com");
    expect(insertMessageVendor(fullMessage("new-full"), vid)).toBe(true);
  });

  it("fills a body-less row from a full fetch, and moves nothing else", () => {
    const vid = insertVendor("acme.com");
    const otherVid = insertVendor("other.com");
    insertMessageVendor(bodylessMessage("m4"), vid);
    expect(rawRow("m4").body_state).toBe("missing");

    // The user state a re-walk must survive: an unsubscribed message that is
    // also linked to an open GDPR case through the action_log.
    getDb().prepare("UPDATE messages SET status = 'unsubscribed' WHERE id = 'm4'").run();
    const { id: caseId } = getDb()
      .prepare(
        "INSERT INTO gdpr_cases (vendor_id, request_type, opened_at) VALUES (?, 'deletion', 1) RETURNING id",
      )
      .get(vid) as { id: number };
    getDb()
      .prepare(
        `INSERT INTO action_log (vendor_id, action_type, message_count, size_bytes, actioned_at, case_id, message_id)
         VALUES (?, 'case_message_linked', 0, 0, 1, ?, 'm4')`,
      )
      .run(vid, caseId);

    const before = wholeRow("m4");
    // Deliberately hostile re-visit: different vendor id, and an incoming row
    // that differs in every column the upsert is allowed to touch.
    expect(
      insertMessageVendor(
        fullMessage("m4", {
          analysis: analysis({
            text: "Thanks for your order\n\nShip to: 10 Downing Street",
            type: "purchase",
            unsubscribe: {
              method: "list-unsubscribe",
              target: "https://acme.com/u",
            },
          }),
        }),
        otherVid,
      ),
    ).toBe(true);
    const after = wholeRow("m4");

    // The capture columns fill; every other column is byte-identical. This list
    // is the upsert's SET list — widening it must be a deliberate edit here.
    expect(changedColumns(before, after)).toEqual([
      "body_preview",
      "body_state",
      "body_text",
      "raw_headers",
      "size_bytes",
      "type",
      "unsubscribe_method",
      "unsubscribe_url",
    ]);
    expect(after.body_state).toBe("available");
    expect(after.body_text).toContain("Ship to: 10 Downing Street");
    // Headers upgraded to the fuller lossless set from the full fetch.
    expect(parseHeaderPairs(after.raw_headers as string).map(([k]) => k)).toContain("Received");
    // Classification and unsubscribe now follow the fuller fetch too.
    expect(after.type).toBe("purchase");
    expect(after.unsubscribe_url).toBe("https://acme.com/u");
    expect(after.unsubscribe_method).toBe("list-unsubscribe");
    // Preview is the analyzed text, whitespace-collapsed.
    expect(after.body_preview).toBe("Thanks for your order Ship to: 10 Downing Street");

    // User state, spelled out — this half of the contract never changes.
    expect(after.status).toBe("unsubscribed");
    expect(after.vendor_id).toBe(vid);
    expect(
      getDb()
        .prepare(
          "SELECT m.id FROM action_log a JOIN messages m ON m.id = a.message_id WHERE a.case_id = ?",
        )
        .get(caseId),
    ).toEqual({ id: "m4" });
  });

  it("changes nothing at all when a body-less fetch follows a full one", () => {
    const vid = insertVendor("acme.com");
    insertMessageVendor(fullMessage("m5"), vid);

    const before = wholeRow("m5");
    expect(insertMessageVendor(bodylessMessage("m5"), vid)).toBe(false);

    // The incoming row disagrees on type, size and preview as well as the body;
    // none of it gets through, because it carried no body.
    expect(changedColumns(before, wholeRow("m5"))).toEqual([]);
    // Spelled out for the reader: the body and the fuller header set survive.
    expect(rawRow("m5").body_state).toBe("available");
    expect(parseHeaderPairs(rawRow("m5").raw_headers).some(([k]) => k === "To")).toBe(true);
  });

  it("never clobbers unsubscribe/review state on re-sync", () => {
    const vid = insertVendor("acme.com");
    const unsubscribed = fullMessage("m6", {
      analysis: analysis({
        text: "Weekly picks",
        type: "promotion",
        unsubscribe: { method: "list-unsubscribe", target: "https://acme.com/unsub" },
      }),
    });
    expect(insertMessageVendor(unsubscribed, vid)).toBe(true);
    // Simulate the user unsubscribing (markVendorUnsubscribed sets status).
    getDb().prepare("UPDATE messages SET status = 'unsubscribed' WHERE id = 'm6'").run();

    // Overlap re-sync of the same message.
    expect(insertMessageVendor(unsubscribed, vid)).toBe(false);

    const row = rawRow("m6");
    expect(row.status).toBe("unsubscribed");
    expect(row.unsubscribe_url).toBe("https://acme.com/unsub");
    expect(row.vendor_id).toBe(vid);
  });

  it("preserves vendor association when a re-sync passes a different vendor id", () => {
    const vidA = insertVendor("acme.com");
    const vidB = insertVendor("other.com");
    insertMessageVendor(fullMessage("m7"), vidA);
    // A re-sync must not re-home the message to another vendor.
    insertMessageVendor(fullMessage("m7"), vidB);
    expect(rawRow("m7").vendor_id).toBe(vidA);
  });
});

describe("destructive marketing action scope", () => {
  it("selects promotions without sweeping in social notifications", () => {
    const vid = insertVendor("network.example");
    insertMessageVendor(
      fullMessage("promotion", {
        analysis: analysis({ text: "Weekly offer", type: "promotion" }),
      }),
      vid,
    );
    insertMessageVendor(
      fullMessage("social", {
        analysis: analysis({ text: "New connection", type: "social" }),
      }),
      vid,
    );

    expect(
      getMessageIdsByVendor(vid, [...MARKETING_ACTION_TYPES]),
    ).toEqual(["promotion"]);
  });
});

describe("parseHeaderPairs — dual-shape tolerance", () => {
  it("reads the lossless array shape", () => {
    expect(parseHeaderPairs(headerPairs([["List-Unsubscribe", "<https://x/u>"]]))).toEqual([
      ["List-Unsubscribe", "<https://x/u>"],
    ]);
  });

  it("reads the legacy object shape (rows synced before losslessization)", () => {
    const legacy = JSON.stringify({ "List-Unsubscribe": "<https://x/u>", From: "a@b.com" });
    expect(parseHeaderPairs(legacy)).toEqual([
      ["List-Unsubscribe", "<https://x/u>"],
      ["From", "a@b.com"],
    ]);
  });
});
