import type { EmailProvider } from "../providers/types";
import { vi } from "vitest";
const mockProvider = vi.hoisted(() => ({
  connect: vi.fn(async () => ({ type: "gmail" })),
  disconnect: vi.fn(async () => undefined),
  listMessages: vi.fn<EmailProvider["listMessages"]>(async () => ({ messages: [] })),
}));
vi.mock("../providers/ProviderFactory", () => ({ getProvider: () => mockProvider }));
vi.mock("../providers/utils", () => ({ friendlyConnectionError: String }));
vi.mock("../credentials", () => ({ loadCredentials: () => ({ providerType: "gmail" }) }));
vi.mock("./analysis", () => ({
  getKnownPiiValues: () => [],
  runReclassifyPass: vi.fn(async () => undefined),
  persistFindings: vi.fn(),
}));
vi.mock("./profileSeed", () => ({ seedProfileEmailsFromCurrentAccount: vi.fn() }));
vi.mock("../utils/log", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { syncLog: logger, dbLog: logger };
});

import { getDb, initDb } from "../db";
import { clearSyncData, getSyncState, runSync, setProgressEmitter } from "./sync";
import { createGdprCase, getGdprCaseById } from "./cases";

beforeEach(() => {
  initDb(":memory:", "/nonexistent", "/nonexistent");
  getDb().exec("DELETE FROM vendors;");
  vi.clearAllMocks();
  mockProvider.listMessages.mockImplementation(async () => ({ messages: [] }));
});

it("walks history without any license and preserves a previous Free account's cursor", async () => {
  const cursor = Date.now() - 120 * 86_400_000;
  getDb().prepare(`UPDATE sync_state SET last_sync_at = ?, quick_sync_done_at = ?, historical_cursor = ?, historical_done = 0 WHERE id = 1`)
    .run(Date.now(), Date.now(), cursor);
  const progress = vi.fn();
  setProgressEmitter(progress);
  await runSync();
  expect(mockProvider.listMessages).toHaveBeenCalledTimes(5);
  expect(mockProvider.listMessages.mock.calls[1]?.[1]).toEqual(new Date(cursor));
  expect(getSyncState().historical_done).toBe(true);
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Sync complete" }));
});

it("does not stop history after three consecutive empty periods", async () => {
  const cursor = Date.now() - 800 * 86_400_000;
  getDb().prepare(`UPDATE sync_state SET last_sync_at = ?, quick_sync_done_at = ?, historical_cursor = ?, historical_done = 0 WHERE id = 1`)
    .run(Date.now(), Date.now(), cursor);
  let historicalChunks = 0;
  mockProvider.listMessages.mockImplementation(async (_since: Date, until?: Date) => {
    if (until) {
      historicalChunks += 1;
      if (historicalChunks > 3) throw new Error("fourth historical chunk started");
    }
    return { messages: [] };
  });
  await runSync();
  expect(historicalChunks).toBe(4);
  expect(getSyncState().historical_done).toBe(false);
});

it("stops history after four consecutive empty periods", async () => {
  const cursor = Date.now() - 800 * 86_400_000;
  getDb().prepare(`UPDATE sync_state SET last_sync_at = ?, quick_sync_done_at = ?, historical_cursor = ?, historical_done = 0 WHERE id = 1`)
    .run(Date.now(), Date.now(), cursor);
  let historicalChunks = 0;
  mockProvider.listMessages.mockImplementation(async (_since: Date, until?: Date) => {
    if (until) historicalChunks += 1;
    return { messages: [] };
  });
  await runSync();
  expect(historicalChunks).toBe(4);
  expect(getSyncState().historical_done).toBe(true);
});

it("resets the empty-period counter when messages are found", async () => {
  const cursor = Date.now() - 500 * 86_400_000;
  getDb().prepare(`UPDATE sync_state SET last_sync_at = ?, quick_sync_done_at = ?, historical_cursor = ?, historical_done = 0 WHERE id = 1`)
    .run(Date.now(), Date.now(), cursor);
  let n = 0;
  mockProvider.listMessages.mockImplementation(async () => {
    n += 1;
    if (n === 3) {
      return {
        messages: [{
          id: "found-1",
          date: Date.now() - 200 * 86_400_000,
          subject: "Hello",
          snippet: "",
          senderEmail: "news@example.test",
          senderName: "News",
          headersJson: "[]",
          analysis: {
            version: "test",
            lang: "eng",
            findings: [],
            text: "hi",
            type: "promotion",
            typeConfidence: 1,
            typeSignals: [],
          },
        }],
      };
    }
    if (n === 7) throw new Error("three empty chunks after mail should still continue");
    return { messages: [] };
  });
  await runSync();
  expect(n).toBe(7);
  expect(getSyncState().historical_done).toBe(false);
});

it("resumes an interrupted paginated query with the original since bound", async () => {
  const originalSince = Date.now() - 2 * 86_400_000;
  const watermark = Date.now() - 60_000;
  getDb().prepare(
    `UPDATE sync_state SET last_sync_at = ?, next_page_token = 'page-2', page_since = ?, quick_sync_done_at = ?, historical_done = 1 WHERE id = 1`,
  ).run(watermark, originalSince, Date.now());
  await runSync();
  expect(mockProvider.listMessages.mock.calls[0]?.[0]).toEqual(new Date(originalSince));
  expect(mockProvider.listMessages.mock.calls[0]?.[2]).toBe("page-2");
  expect(getSyncState().next_page_token).toBeUndefined();
});

it("does not advance last_sync_at while a paginated query is still in progress", async () => {
  const watermark = Date.now() - 60_000;
  getDb().prepare(
    `UPDATE sync_state SET last_sync_at = ?, quick_sync_done_at = ?, historical_done = 1 WHERE id = 1`,
  ).run(watermark, Date.now());
  mockProvider.listMessages.mockImplementation(async (_since: Date, _until?: Date, page?: string) => {
    if (page === "page-2") throw new Error("interrupted");
    return { messages: [], nextPageToken: "page-2" };
  });
  await runSync();
  const state = getSyncState();
  expect(state.last_sync_at).toBe(watermark);
  expect(state.next_page_token).toBe("page-2");
  expect(state.page_since).toBeDefined();
});

it("preserves GDPR cases and action history when re-syncing", () => {
  getDb().prepare("INSERT INTO vendors (id, root_domain, name) VALUES (1, 'example.test', 'Example')").run();
  const created = createGdprCase({
    vendorId: 1,
    requestType: "access",
    recipientEmail: "privacy@example.test",
    subject: "Access request",
    body: "Please send my data",
  });
  getDb().prepare(
    "INSERT INTO action_log (vendor_id, action_type, message_count, size_bytes, actioned_at) VALUES (1, 'unsubscribed', 2, 0, ?)",
  ).run(Date.now());
  getDb().prepare(
    "INSERT INTO messages (id, vendor_id, sender_email, date, type, size_bytes, body_state) VALUES ('m1', 1, 'a@example.test', ?, 'promotion', 10, 'missing')",
  ).run(Date.now());

  clearSyncData();

  expect(getGdprCaseById(created.id)?.id).toBe(created.id);
  expect(getDb().prepare("SELECT COUNT(*) as c FROM vendors").get()).toEqual({ c: 1 });
  expect(getDb().prepare("SELECT COUNT(*) as c FROM action_log").get()).toEqual({ c: 2 });
  expect(getDb().prepare("SELECT COUNT(*) as c FROM messages").get()).toEqual({ c: 0 });
});
