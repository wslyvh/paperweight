import Database from "better-sqlite3";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, unlinkSync } from "fs";

jest.mock("../utils/log", () => ({
  dbLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../credentials", () => ({ emailToFileKey: jest.fn() }));

import { getDb, initDb, reconnectDb } from "../db";
import { migrateVendors } from "../migrations";
import {
  closeGdprCase,
  createGdprCase,
  deriveNextAction,
  escalateGdprCase,
  getGdprCaseById,
  getGdprCaseReplies,
  insertGdprCaseEvent,
  linkGdprCaseMessage,
  queryGdprCases,
  reopenGdprCase,
  syncCaseRepliesForVendors,
  unlinkGdprCaseMessage,
} from "./cases";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => Date.now() - days * DAY_MS;

function insertVendor(rootDomain: string): number {
  const result = getDb()
    .prepare("INSERT INTO vendors (root_domain, name) VALUES (?, ?)")
    .run(rootDomain, rootDomain);
  return Number(result.lastInsertRowid);
}

beforeAll(() => {
  initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent");
});

describe("createGdprCase / getGdprCaseById", () => {
  it("creates a case with a request_sent event holding the evidence copy", () => {
    const vendorId = insertVendor("acme.com");
    const created = createGdprCase({
      vendorId,
      requestType: "deletion",
      recipientEmail: "privacy@acme.com",
      subject: "Personal Data Deletion Request",
      body: "Please delete my data.",
    });

    expect(created.status).toBe("active");

    const detail = getGdprCaseById(created.id);
    expect(detail).toBeDefined();
    expect(detail!.vendorName).toBe("acme.com");
    expect(detail!.recipientEmail).toBe("privacy@acme.com");
    expect(detail!.events).toHaveLength(1);
    expect(detail!.events[0].actionType).toBe("gdpr_request_sent");
    expect(detail!.events[0].subject).toBe("Personal Data Deletion Request");
    expect(detail!.events[0].body).toBe("Please delete my data.");
  });

  it("exposes vendors.account_email on the case detail", () => {
    const vendorId = insertVendor("alias-shop.com");
    getDb()
      .prepare("UPDATE vendors SET account_email = ? WHERE id = ?")
      .run("shop-alias@passmail.net", vendorId);
    const created = createGdprCase({
      vendorId,
      requestType: "deletion",
      recipientEmail: "privacy@alias-shop.com",
      subject: "s",
      body: "b",
    });
    expect(getGdprCaseById(created.id)!.accountEmail).toBe("shop-alias@passmail.net");
  });
});

describe("deriveNextAction", () => {
  it("waits before day 14, then walks reminder → followup → escalate", () => {
    expect(deriveNextAction(daysAgo(5), [])).toBeUndefined();
    expect(deriveNextAction(daysAgo(15), [])).toBe("reminder");
    expect(deriveNextAction(daysAgo(31), [])).toBe("followup");
    expect(deriveNextAction(daysAgo(61), [])).toBe("escalate");
  });

  it("does not repeat a reminder or followup that was already sent", () => {
    expect(deriveNextAction(daysAgo(15), [{ actionType: "reminder_sent" }])).toBeUndefined();
    expect(
      deriveNextAction(daysAgo(31), [{ actionType: "followup_sent" }]),
    ).toBeUndefined();
    expect(deriveNextAction(daysAgo(15), [{ actionType: "followup_sent" }])).toBeUndefined();
  });

  it("pauses reminder/followup nudges when a thread-matched reply or manual link exists", () => {
    expect(
      deriveNextAction(daysAgo(15), [{ actionType: "reply_received" }]),
    ).toBeUndefined();
    expect(
      deriveNextAction(daysAgo(15), [{ actionType: "case_message_linked" }]),
    ).toBeUndefined();
  });

  it("still escalates past 60 days even after a reply — an acknowledgement is not fulfilment", () => {
    expect(
      deriveNextAction(daysAgo(61), [{ actionType: "reply_received" }]),
    ).toBe("escalate");
    expect(
      deriveNextAction(daysAgo(61), [{ actionType: "case_message_linked" }]),
    ).toBe("escalate");
  });
});

describe("closeGdprCase / reopenGdprCase", () => {
  it("sets outcome and closed_at, logs a case_closed event, clears nextAction", () => {
    const vendorId = insertVendor("closeme.com");
    const created = createGdprCase({ vendorId, requestType: "access", openedAt: daysAgo(40) });
    expect(getGdprCaseById(created.id)!.nextAction).toBe("followup");

    closeGdprCase(created.id);

    const detail = getGdprCaseById(created.id)!;
    expect(detail.status).toBe("closed");
    expect(detail.outcome).toBe("resolved");
    expect(detail.closedAt).toBeDefined();
    expect(detail.nextAction).toBeUndefined();
    expect(detail.events.map((e) => e.actionType)).toContain("case_closed");

    reopenGdprCase(created.id);
    const reopened = getGdprCaseById(created.id)!;
    expect(reopened.status).toBe("active");
    expect(reopened.outcome).toBeUndefined();
    expect(reopened.closedAt).toBeUndefined();
    expect(reopened.nextAction).toBe("followup");
  });
});

describe("escalateGdprCase", () => {
  it("logs escalated, closes the case, and can be reopened", () => {
    const vendorId = insertVendor("escalate.com");
    const created = createGdprCase({ vendorId, requestType: "deletion", openedAt: daysAgo(65) });

    escalateGdprCase(created.id);

    const detail = getGdprCaseById(created.id)!;
    expect(detail.status).toBe("closed");
    expect(detail.outcome).toBe("escalated");
    expect(detail.events.map((e) => e.actionType)).toEqual(
      expect.arrayContaining(["escalated", "case_closed"]),
    );

    reopenGdprCase(created.id);
    expect(getGdprCaseById(created.id)!.status).toBe("active");
  });
});

describe("queryGdprCases", () => {
  it("filters by status and vendor", () => {
    const vendorId = insertVendor("filter.com");
    const active = createGdprCase({ vendorId, requestType: "access" });
    const closed = createGdprCase({ vendorId, requestType: "deletion" });
    closeGdprCase(closed.id);

    const activeCases = queryGdprCases({ status: "active", vendorId });
    expect(activeCases.map((c) => c.id)).toEqual([active.id]);

    const closedCases = queryGdprCases({ status: "closed", vendorId });
    expect(closedCases.map((c) => c.id)).toEqual([closed.id]);
    expect(closedCases[0].vendorName).toBe("filter.com");
  });
});

function insertMessage(
  id: string,
  vendorId: number,
  date: number,
  opts?: { type?: string; subject?: string; headers?: Record<string, string> },
): void {
  getDb()
    .prepare(
      `INSERT INTO messages (id, vendor_id, sender_email, subject, date, raw_headers, type)
       VALUES (?, ?, 'support@vendor.com', ?, ?, ?, ?)`,
    )
    .run(
      id,
      vendorId,
      opts?.subject ?? "Re: your request",
      date,
      opts?.headers ? JSON.stringify(opts.headers) : null,
      opts?.type ?? "personal",
    );
}

describe("getGdprCaseReplies", () => {
  it("splits thread matches from other vendor mail and excludes list mail and old messages", () => {
    const vendorId = insertVendor("candidates.com");
    const created = createGdprCase({
      vendorId,
      requestType: "access",
      openedAt: daysAgo(10),
      sentMessageId: "<req-123@paperweight>",
    });

    insertMessage("m-thread", vendorId, daysAgo(8), {
      headers: { "In-Reply-To": "<req-123@paperweight>", References: "<req-123@paperweight>" },
    });
    insertMessage("m-unrelated", vendorId, daysAgo(7));
    insertMessage("m-promo", vendorId, daysAgo(6), { type: "promotion" });
    insertMessage("m-social", vendorId, daysAgo(6), { type: "social" });
    insertMessage("m-before", vendorId, daysAgo(20));

    const { threadMatches, otherReplies } = getGdprCaseReplies(created.id);
    expect(threadMatches.map((m) => m.id)).toEqual(["m-thread"]);
    expect(otherReplies.map((m) => m.id)).toEqual(["m-unrelated"]);
    expect(getGdprCaseReplies(created.id).linkedMessageIds).toEqual([]);
  });
});

describe("linkGdprCaseMessage / unlinkGdprCaseMessage", () => {
  it("links a vendor message to the case and returns it in linkedMessageIds", () => {
    const vendorId = insertVendor("linkme.com");
    const created = createGdprCase({
      vendorId,
      requestType: "access",
      openedAt: daysAgo(10),
    });
    insertMessage("m-link-other", vendorId, daysAgo(7));

    linkGdprCaseMessage(created.id, "m-link-other");

    const replies = getGdprCaseReplies(created.id);
    expect(replies.linkedMessageIds).toEqual(["m-link-other"]);
    expect(replies.otherReplies.map((m) => m.id)).toEqual(["m-link-other"]);
  });

  it("unlinks only manual links, not auto thread matches", () => {
    const vendorId = insertVendor("unlink.com");
    const created = createGdprCase({
      vendorId,
      requestType: "deletion",
      openedAt: daysAgo(10),
      sentMessageId: "<req-unlink@paperweight>",
    });
    insertMessage("m-unlink-thread", vendorId, daysAgo(8), {
      headers: { "In-Reply-To": "<req-unlink@paperweight>" },
    });
    insertMessage("m-unlink-manual", vendorId, daysAgo(6));

    linkGdprCaseMessage(created.id, "m-unlink-manual");
    unlinkGdprCaseMessage(created.id, "m-unlink-manual");

    const replies = getGdprCaseReplies(created.id);
    expect(replies.linkedMessageIds).toEqual([]);
    expect(replies.threadMatches.map((m) => m.id)).toEqual(["m-unlink-thread"]);
  });
});

describe("syncThreadMatchedReplies", () => {
  it("auto-logs thread matches already in the mailbox at create time (pure read after)", () => {
    const vendorId = insertVendor("sync.com");
    // Reply already present before the case exists (manual/backdated case).
    insertMessage("m-reply", vendorId, daysAgo(4), {
      subject: "Re: deletion request",
      headers: { "In-Reply-To": "<req-456@paperweight>" },
    });
    const created = createGdprCase({
      vendorId,
      requestType: "deletion",
      openedAt: daysAgo(5),
      sentMessageId: "<req-456@paperweight>",
    });

    const detail = getGdprCaseById(created.id)!;
    const replies = detail.events.filter((e) => e.actionType === "reply_received");
    expect(replies).toHaveLength(1);
    expect(replies[0].messageId).toBe("m-reply");
    expect(replies[0].subject).toBe("Re: deletion request");
  });

  it("does not mutate the case on read — a reply arriving after create is not picked up by getGdprCaseById alone", () => {
    const vendorId = insertVendor("read-pure.com");
    const created = createGdprCase({
      vendorId,
      requestType: "deletion",
      openedAt: daysAgo(5),
      sentMessageId: "<req-pure@paperweight>",
    });
    insertMessage("m-late-reply", vendorId, daysAgo(4), {
      headers: { "In-Reply-To": "<req-pure@paperweight>" },
    });

    // Reading the case must not write reply_received; the sync pipeline does that.
    expect(
      getGdprCaseById(created.id)!.events.filter((e) => e.actionType === "reply_received"),
    ).toHaveLength(0);

    syncCaseRepliesForVendors([vendorId]);
    expect(
      getGdprCaseById(created.id)!.events.filter((e) => e.actionType === "reply_received"),
    ).toHaveLength(1);
  });
});

describe("syncCaseRepliesForVendors", () => {
  it("materializes replies so queryGdprCases reflects them without opening the case", () => {
    const vendorId = insertVendor("ingest.com");
    const created = createGdprCase({
      vendorId,
      requestType: "access",
      openedAt: daysAgo(40),
      sentMessageId: "<req-ingest@paperweight>",
    });
    insertMessage("m-ingest-reply", vendorId, daysAgo(2), {
      headers: { "In-Reply-To": "<req-ingest@paperweight>" },
    });

    // Before syncing, the list-path nudge is stale (still asks to follow up).
    expect(queryGdprCases({ vendorId }).find((c) => c.id === created.id)!.nextAction).toBe(
      "followup",
    );

    syncCaseRepliesForVendors([vendorId]);

    // After syncing at ingest time, the reply suppresses the nudge on the list path.
    expect(
      queryGdprCases({ vendorId }).find((c) => c.id === created.id)!.nextAction,
    ).toBeUndefined();
  });
});

describe("closeGdprCase idempotency", () => {
  it("does not overwrite an escalated outcome or log a second case_closed", () => {
    const vendorId = insertVendor("idempotent.com");
    const created = createGdprCase({ vendorId, requestType: "deletion", openedAt: daysAgo(65) });
    escalateGdprCase(created.id);

    closeGdprCase(created.id);

    const detail = getGdprCaseById(created.id)!;
    expect(detail.outcome).toBe("escalated");
    expect(detail.events.filter((e) => e.actionType === "case_closed")).toHaveLength(1);
  });
});

describe("reopenGdprCase cleanup", () => {
  it("drops terminal events so a reopened case shows no closed/escalated history", () => {
    const vendorId = insertVendor("reopen-clean.com");
    const created = createGdprCase({ vendorId, requestType: "access", openedAt: daysAgo(65) });
    escalateGdprCase(created.id);

    reopenGdprCase(created.id);

    const detail = getGdprCaseById(created.id)!;
    expect(detail.status).toBe("active");
    const terminal = detail.events.filter(
      (e) => e.actionType === "case_closed" || e.actionType === "escalated",
    );
    expect(terminal).toHaveLength(0);
  });
});

describe("vendors account_email migration", () => {
  it("adds account_email to a vendors table created without it", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root_domain TEXT NOT NULL,
        name TEXT NOT NULL
      );
    `);

    migrateVendors(db);

    const vendorCols = (db.pragma("table_info(vendors)") as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(vendorCols).toContain("account_email");
    db.close();
  });
});

describe("action_log migration", () => {
  const tmpPath = join(tmpdir(), `paperweight-migration-test-${process.pid}.db`);

  afterAll(() => {
    reconnectDb(":memory:");
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(tmpPath + suffix)) unlinkSync(tmpPath + suffix);
    }
  });

  it("adds case columns to an action_log created before gdpr_cases existed", () => {
    const old = new Database(tmpPath);
    old.exec(`
      CREATE TABLE action_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        sender_email TEXT,
        unsubscribe_url TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        actioned_at INTEGER NOT NULL
      );
    `);
    old
      .prepare(
        "INSERT INTO action_log (vendor_id, action_type, message_count, size_bytes, actioned_at) VALUES (1, 'unsubscribed', 5, 100, ?)",
      )
      .run(Date.now());
    old.close();

    reconnectDb(tmpPath);
    getDb().prepare("INSERT INTO vendors (root_domain, name) VALUES ('legacy.com', 'legacy.com')").run();

    const columns = (getDb().pragma("table_info(action_log)") as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining(["case_id", "message_id", "subject", "body"]),
    );

    const created = createGdprCase({ vendorId: 1, requestType: "deletion", subject: "s", body: "b" });
    const detail = getGdprCaseById(created.id)!;
    expect(detail.events[0].actionType).toBe("gdpr_request_sent");
    const oldRow = getDb()
      .prepare("SELECT action_type, case_id FROM action_log WHERE action_type = 'unsubscribed'")
      .get() as { action_type: string; case_id: number | null };
    expect(oldRow.case_id).toBeNull();
  });
});
