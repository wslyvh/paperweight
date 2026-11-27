import { vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
let mockUserData = vi.hoisted(() => "");
vi.mock("electron", () => ({ app: { getPath: () => mockUserData } }));
vi.mock("./providers/smtp", () => ({ testSmtpConnection: vi.fn() }));
vi.mock("./credentials", () => ({
  emailToFileKey: vi.fn(),
  accountTag: () => "test-account",
  listAccounts: vi.fn(),
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
}));
vi.mock("./utils/log", () => {
  const l = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { dbLog: l, syncLog: l, appLog: l };
});

import { createAccountDb, getDb, initDb } from "./db";
import { emailToFileKey, listAccounts, loadCredentials } from "./credentials";
import { SecureStorageError } from "./secureStorage";
import {
  runMigrations,
  applyEngineSwitch,
  applyReceivedAddresses,
  markReceivedAddressesDone,
  migrateQueryIndexes,
} from "./migrations";

// The switch release resets each account's sync cursors so the next sync behaves
// like a fresh install. Nothing else may move: message ids are stable, so every
// re-visited row merges through the upsert instead of being re-created.

const setting = (key: string): string | undefined =>
  (getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined)?.value;

const syncState = () =>
  getDb().prepare("SELECT * FROM sync_state WHERE id = 1").get() as Record<string, unknown>;

const counts = () => {
  const d = getDb();
  const of = (table: string) =>
    (d.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;
  return {
    messages: of("messages"),
    vendors: of("vendors"),
    action_log: of("action_log"),
    gdpr_cases: of("gdpr_cases"),
    whitelist: of("whitelist"),
    pii_findings: of("pii_findings"),
  };
};

// A database as it looks the moment before the upgrade: synced, classified under
// the old vocabulary, with user state on top of it.
function seedPreUpgradeDb(): void {
  const d = getDb();
  d.exec(`
    DELETE FROM pii_findings; DELETE FROM action_log;
    DELETE FROM gdpr_cases; DELETE FROM messages; DELETE FROM vendors;
    DELETE FROM whitelist; DELETE FROM settings;
    UPDATE sync_state SET
      last_sync_at = 1700000000000, next_page_token = 'page-2',
      quick_sync_done_at = 1699000000000, historical_cursor = 1690000000000,
      historical_done = 1, sync_checkpoint = 'history-9876'
    WHERE id = 1;

    INSERT INTO vendors (id, root_domain, name, message_count) VALUES (1, 'acme.com', 'Acme', 2);
    INSERT INTO messages (id, vendor_id, sender_email, date, type, status, body_state)
      VALUES ('m1', 1, 'hello@acme.com', 1000, 'bulk', 'unsubscribed', 'missing'),
             ('m2', 1, 'orders@acme.com', 2000, 'order', NULL, 'available');
    INSERT INTO gdpr_cases (id, vendor_id, request_type, opened_at) VALUES (7, 1, 'deletion', 500);
    INSERT INTO action_log (vendor_id, action_type, message_count, size_bytes, actioned_at)
      VALUES (1, 'unsubscribed', 2, 100, 600);
    INSERT INTO whitelist (value) VALUES ('keep@acme.com');
    INSERT INTO pii_findings (message_id, type, value_normalized, in_quoted_text)
      VALUES ('m2', 'email', 'a@b.com', 0);
  `);
}

beforeAll(() => initDb(":memory:", "/nonexistent", "/nonexistent"));
beforeEach(seedPreUpgradeDb);

it("upgrades navigation indexes without changing mailbox rows or rebuilding on repeat", () => {
  const d = getDb();
  d.exec(`
    DROP INDEX idx_messages_id_metadata;
    DROP INDEX idx_messages_vendor_metadata;
    DROP INDEX idx_pii_findings_value_metadata;
    CREATE INDEX idx_messages_vendor ON messages(vendor_id);
    CREATE INDEX idx_pii_findings_type_value ON pii_findings(type, value_normalized);
  `);
  const messages = d.prepare("SELECT * FROM messages ORDER BY id").all();
  const findings = d.prepare("SELECT * FROM pii_findings ORDER BY id").all();

  migrateQueryIndexes(d);

  expect(d.prepare("SELECT * FROM messages ORDER BY id").all()).toEqual(messages);
  expect(d.prepare("SELECT * FROM pii_findings ORDER BY id").all()).toEqual(findings);
  const plan = d.prepare(
    "EXPLAIN QUERY PLAN SELECT id, type, date, sender_email FROM messages WHERE vendor_id = ?",
  ).all(1) as Array<{ detail: string }>;
  expect(plan.some((row) => row.detail.includes("COVERING INDEX"))).toBe(true);

  const version = d.pragma("schema_version", { simple: true });
  migrateQueryIndexes(d);
  expect(d.pragma("schema_version", { simple: true })).toBe(version);
});

it("migrates a readable account when another account's credentials cannot be read", async () => {
  mockUserData = mkdtempSync(join(tmpdir(), "paperweight-migrations-"));
  vi.mocked(listAccounts).mockReturnValue([
    { email: "locked@example.test", providerType: "gmail" },
    { email: "working@example.test", providerType: "gmail" },
  ]);
  vi.mocked(emailToFileKey).mockImplementation((email) => email.split("@")[0]);
  vi.mocked(loadCredentials).mockImplementation(async (email) => {
    if (email === "locked@example.test") throw new SecureStorageError("read");
    return { providerType: "gmail" };
  });
  try {
    for (const name of ["locked", "working"]) {
      writeFileSync(join(mockUserData, `${name}.db`), getDb().serialize());
    }
    await runMigrations();
    for (const name of ["locked", "working"]) {
      const db = new Database(join(mockUserData, `${name}.db`));
      try {
        const marker = db.prepare("SELECT value FROM settings WHERE key = 'migration:all-mail-scope'").get();
        expect(Boolean(marker)).toBe(name === "working");
      } finally {
        db.close();
      }
    }
  } finally {
    rmSync(mockUserData, { recursive: true, force: true });
  }
});

describe("applyEngineSwitch", () => {
  it("resets the add-path cursors and flags the reclassify pass", () => {
    expect(applyEngineSwitch(getDb())).toBe(true);

    const state = syncState();
    expect(state.last_sync_at).toBeNull();
    expect(state.next_page_token).toBeNull();
    expect(state.quick_sync_done_at).toBeNull();
    expect(state.historical_cursor).toBeNull();
    expect(state.historical_done).toBe(0);

    expect(setting("migration:reclassify")).toBe("1");
    expect(setting("migration:engine-switch")).toBe("1");
  });

  it("leaves the removal cursor alone", () => {
    applyEngineSwitch(getDb());
    // sync_checkpoint is the Gmail History cursor for deletions — unrelated to
    // the add path, and re-baselining it would discard deletion tracking.
    expect(syncState().sync_checkpoint).toBe("history-9876");
  });

  it("clears nothing — ids are stable, so re-visited rows merge", () => {
    const before = counts();
    applyEngineSwitch(getDb());

    expect(counts()).toEqual(before);
    // User state specifically: an unsubscribed message stays unsubscribed, and
    // its vendor, case and suppression all survive.
    const msg = getDb().prepare("SELECT * FROM messages WHERE id = 'm1'").get() as Record<
      string,
      unknown
    >;
    expect(msg.status).toBe("unsubscribed");
    expect(msg.vendor_id).toBe(1);
    expect(
      getDb().prepare("SELECT COUNT(*) c FROM gdpr_cases WHERE id = 7").get(),
    ).toEqual({ c: 1 });
  });

  it("fires exactly once — a relaunch is a no-op", () => {
    expect(applyEngineSwitch(getDb())).toBe(true);

    // The sync that follows the migration repopulates the cursors.
    getDb()
      .prepare(
        "UPDATE sync_state SET last_sync_at = 1800000000000, quick_sync_done_at = 1800000000000, historical_cursor = 1750000000000 WHERE id = 1",
      )
      .run();

    expect(applyEngineSwitch(getDb())).toBe(false);

    // Second launch must not reset what the first sync just earned.
    const state = syncState();
    expect(state.last_sync_at).toBe(1800000000000);
    expect(state.quick_sync_done_at).toBe(1800000000000);
    expect(state.historical_cursor).toBe(1750000000000);
  });
});

describe("receiver address migration", () => {
  const headers = (pairs: Array<[string, string]>): string => JSON.stringify(pairs);

  function seedMessage(id: string, rawHeaders: string): void {
    getDb()
      .prepare(
        `INSERT INTO messages (id, vendor_id, sender_email, date, raw_headers, body_state)
         VALUES (?, 1, 'hello@acme.example', 1700000000000, ?, 'available')`,
      )
      .run(id, rawHeaders);
  }

  const addressOf = (id: string): string | null =>
    getDb()
      .prepare("SELECT received_address FROM messages WHERE id = ?")
      .pluck()
      .get(id) as string | null;

  beforeEach(() => {
    const d = getDb();
    d.exec("DELETE FROM messages; DELETE FROM vendors; DELETE FROM settings;");
    d.prepare(
      "INSERT INTO vendors (id, root_domain, name) VALUES (1, 'acme.example', 'Acme')",
    ).run();
  });

  it("fills rows whose chain and To agree, and reports the addresses", () => {
    seedMessage(
      "m1",
      headers([
        ["Delivered-To", "me@provider.example"],
        ["Delivered-To", "shop@mydomain.example"],
        ["To", "shop@mydomain.example"],
      ]),
    );

    const result = applyReceivedAddresses(getDb());

    expect(result).toMatchObject({ resolved: 1, scanned: 1, skippedLegacy: 0 });
    expect([...result!.addresses]).toEqual(["shop@mydomain.example"]);
    expect(addressOf("m1")).toBe("shop@mydomain.example");
    expect(addressOf("m1")).toBe("shop@mydomain.example");
  });

  it("leaves a row alone when nothing corroborates the chain", () => {
    seedMessage(
      "m1",
      headers([
        ["Delivered-To", "me@provider.example"],
        ["Delivered-To", "junk@spammer.example"],
        ["To", "me@provider.example"],
      ]),
    );

    expect(applyReceivedAddresses(getDb())).toMatchObject({ resolved: 0 });
    expect(addressOf("m1")).toBeNull();
  });

  // The legacy object shape dropped duplicate Delivered-To and Received lines
  // when it was written, so the chain cannot be rebuilt. Counted, not guessed.
  it("skips and counts rows stored in the legacy header shape", () => {
    seedMessage(
      "m1",
      JSON.stringify({ "Delivered-To": "shop@mydomain.example", To: "shop@mydomain.example" }),
    );

    expect(applyReceivedAddresses(getDb())).toMatchObject({
      resolved: 0,
      skippedLegacy: 1,
    });
    expect(addressOf("m1")).toBeNull();
  });

  // The marker is what makes this run once, not the absence of NULL rows.
  // Microsoft records no chain at all, so its rows stay NULL forever; without a
  // marker they would be re-parsed on every single launch.
  it("fires exactly once, even when every row stayed unresolved", () => {
    seedMessage(
      "microsoft",
      headers([
        ["Received", "from a.example by b.example; Wed, 1 Jan 2025 00:00:00 +0000"],
        ["To", "me@provider.example"],
      ]),
    );

    expect(applyReceivedAddresses(getDb())).toMatchObject({ resolved: 0, scanned: 1 });
    expect(addressOf("microsoft")).toBeNull();
    markReceivedAddressesDone(getDb());

    // Second launch: no rescan at all, not even of the row that stayed NULL.
    expect(applyReceivedAddresses(getDb())).toBeNull();
  });

  it("does not rescan resolvable rows on a later launch", () => {
    seedMessage(
      "m1",
      headers([
        ["Delivered-To", "shop@mydomain.example"],
        ["To", "shop@mydomain.example"],
      ]),
    );

    expect(applyReceivedAddresses(getDb())).toMatchObject({ resolved: 1 });
    markReceivedAddressesDone(getDb());

    expect(applyReceivedAddresses(getDb())).toBeNull();
    expect(addressOf("m1")).toBe("shop@mydomain.example");
  });

  // The row fill and the profile insert live in different database files, so
  // they cannot be one transaction. The marker is written last, and a retry
  // reads the addresses back off the column rather than from the pass that
  // filled it, so a failed profile write loses nothing.
  it("still reports every address when a retry finds the rows already filled", () => {
    seedMessage(
      "m1",
      headers([
        ["Delivered-To", "shop@mydomain.example"],
        ["To", "shop@mydomain.example"],
      ]),
    );

    // First launch fills the rows, then the profile write fails: no marker.
    expect(applyReceivedAddresses(getDb())).toMatchObject({ resolved: 1 });

    // Second launch finds nothing left to resolve, and still knows the address.
    const retry = applyReceivedAddresses(getDb());
    expect(retry).toMatchObject({ resolved: 0, scanned: 0 });
    expect([...retry!.addresses]).toEqual(["shop@mydomain.example"]);
  });
});


it.each(["gmail", "microsoft", "imap"] as const)(
  "preserves a newly created %s account's messages and sync progress on restart",
  async (providerType) => {
    mockUserData = mkdtempSync(join(tmpdir(), "paperweight-fresh-account-"));
    const path = join(mockUserData, "fresh.db");
    vi.mocked(listAccounts).mockReturnValue([{ email: "fresh@example.test", providerType }]);
    vi.mocked(emailToFileKey).mockReturnValue("fresh");
    vi.mocked(loadCredentials).mockResolvedValue({ providerType });
    try {
      createAccountDb(path);
      const fresh = new Database(path);
      let before: unknown;
      try {
        fresh.exec(`
          INSERT INTO vendors (id, root_domain, name) VALUES (1, 'example.test', 'Example');
          INSERT INTO messages (id, vendor_id, sender_email, date, type)
            VALUES ('fresh-message', 1, 'hello@example.test', 1700000000000, 'order');
          UPDATE sync_state SET last_sync_at = 1700000000000,
            quick_sync_done_at = 1699000000000, historical_cursor = 1690000000000,
            historical_done = 1, sync_checkpoint = 'fixture-cursor' WHERE id = 1;
        `);
        before = fresh.prepare("SELECT * FROM sync_state").all();
      } finally {
        fresh.close();
      }

      // Startup migrations run after account creation on the next launch.
      for (let restart = 0; restart < 2; restart++) {
        await runMigrations();
        const reopened = new Database(path);
        try {
          expect(reopened.prepare("SELECT id FROM messages").all()).toEqual([{ id: "fresh-message" }]);
          expect(reopened.prepare("SELECT * FROM sync_state").all()).toEqual(before);
          expect(reopened.prepare("SELECT value FROM settings WHERE key = 'migration:reclassify'").get()).toBeUndefined();
        } finally {
          reopened.close();
        }
      }
    } finally {
      rmSync(mockUserData, { recursive: true, force: true });
    }
  },
);
