import { vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let mockUserData = vi.hoisted(() => (""));
vi.mock("electron", () => ({
  app: { getPath: () => mockUserData },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => Buffer.from(value),
    decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false }),
  },
}));
vi.mock("../utils/log", () => {
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return { dbLog: logger, licenseLog: logger };
});
vi.mock("./vendors", () => ({
  getVendorDetail: () => ({
    vendor: { id: 1, root_domain: "example.test", account_email: "person@example.test" },
    company: { email: "privacy@example.test" },
    senders: [], receivedAddresses: [],
  }),
  updateVendor: vi.fn(),
}));
vi.mock("./email", () => ({ sendEmail: vi.fn() }));

import { getDb, initDb, reconnectDb } from "../db";
import { createGdprCase, getGdprCaseById } from "./cases";
import { sendPrivacyRequest } from "./gdprActions";
import { getLicenseStatus } from "./settings";
import { sendEmail } from "./email";

beforeEach(() => {
  mockUserData = mkdtempSync(join(tmpdir(), "paperweight-case-entitlement-"));
  initDb(":memory:", "/nonexistent", "/nonexistent");
  reconnectDb(":memory:");
  getDb().prepare("INSERT INTO vendors (id, root_domain, name) VALUES (1, 'example.test', 'Synthetic company')").run();
  vi.clearAllMocks();
});
afterEach(() => rmSync(mockUserData, { recursive: true, force: true }));

it("records the sent request even when the license disappears during sending", async () => {
  writeFileSync(join(mockUserData, "license.enc"), JSON.stringify({
    key: "CASE-TEST", tier: "test", validatedAt: Date.now(),
  }));
  vi.mocked(sendEmail).mockImplementationOnce(async () => {
    unlinkSync(join(mockUserData, "license.enc"));
    return { success: true, messageId: "sent-before-downgrade" };
  });
  const result = await sendPrivacyRequest(
    1, "example.test", "access", "person@example.test",
    undefined, undefined, undefined, async () => "confirmed",
  );
  expect((await getLicenseStatus()).active).toBe(false);
  expect(result.status).toBe("sent");
  expect(getGdprCaseById(result.caseId!)?.sentMessageId).toBe("sent-before-downgrade");
  expect(getGdprCaseById(result.caseId!)?.events[0].actionType).toBe("gdpr_request_sent");
});

it("lets Free record a manually sent request without sending mail", async () => {
  expect((await getLicenseStatus()).active).toBe(false);
  const created = createGdprCase({
    vendorId: 1, requestType: "deletion", recipientEmail: "privacy@example.test",
    subject: "Deletion request", body: "Synthetic manually sent request.",
  });
  expect(getGdprCaseById(created.id)?.events[0].body).toBe("Synthetic manually sent request.");
  expect(sendEmail).not.toHaveBeenCalled();
});
