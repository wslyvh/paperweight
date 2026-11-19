import { vi } from "vitest";
vi.mock("../main/services/settings", () => ({ getLicenseStatus: vi.fn(() => ({ active: true })), PRO_REQUIRED_MESSAGE: "Pro required" }));
const mockReconnectDb = vi.hoisted(() => (vi.fn()));
const mockWithAccountDbReadConnection = vi.hoisted(() => (vi.fn((_path: string, read: (database: unknown) => unknown) =>
  read({}),
)));

vi.mock("fs", () => ({ existsSync: vi.fn(() => true) }));
vi.mock("../main/credentials", () => ({
  configureAccountRegistryPath: vi.fn(),
  emailToFileKey: vi.fn((email: string) => email.replace("@", "_")),
  listAccounts: vi.fn(() => [
    { email: "first@example.test", providerType: "gmail" },
    { email: "second@example.test", providerType: "gmail" },
  ]),
}));
vi.mock("../main/db", () => ({
  getDb: vi.fn(),
  initDb: vi.fn(),
  reconnectDb: mockReconnectDb,
  withAccountDbReadConnection: mockWithAccountDbReadConnection,
}));
vi.mock("../main/globalDb", () => ({ configureGlobalDbPath: vi.fn() }));
vi.mock("../main/services/globalSettings", () => ({
  getGlobalSetting: vi.fn((key: string) => {
    if (key === "agentAccess") return "actions";
    if (key === "activeAccount") return "first@example.test";
    return undefined;
  }),
}));

import {
  initializePaperweight,
  readMailboxDatabase,
  requireSelectedMailbox,
  selectMailbox,
  withSelectedMailboxAction,
} from "./runtime";
import {
  mailboxReference,
  parseMailboxNumberReference,
} from "./identifiers";

describe("MCP mailbox actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prevents account database switches until an async action finishes", async () => {
    await initializePaperweight();
    let releaseAction: (() => void) | undefined;
    const actionFinished = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });
    const action = withSelectedMailboxAction(async (email) => {
      expect(email).toBe("first@example.test");
      await actionFinished;
    });

    expect(() => selectMailbox("second_example.test")).toThrow(
      "Wait for the current mailbox action to finish",
    );
    expect(mockReconnectDb).not.toHaveBeenCalled();

    releaseAction?.();
    await action;
    expect(selectMailbox("second_example.test")).toBe(true);
    expect(mockReconnectDb).toHaveBeenCalledTimes(1);
  });

  it("reads list_mailboxes summaries without reconnecting the selected database", async () => {
    await initializePaperweight();

    expect(readMailboxDatabase("second@example.test", () => "summary")).toBe("summary");
    expect(mockWithAccountDbReadConnection).toHaveBeenCalledWith(
      expect.stringContaining("second_example.test.db"),
      expect.any(Function),
    );
    expect(mockReconnectDb).not.toHaveBeenCalled();
  });

  it("rejects a write argument from the previously selected mailbox", async () => {
    await initializePaperweight();
    const staleReference = mailboxReference(1);
    selectMailbox("second_example.test");

    expect(() => requireSelectedMailbox("first_example.test")).toThrow(
      "selected mailbox is second_example.test",
    );
    expect(requireSelectedMailbox("second_example.test")).toBe("second_example.test");
    expect(() => parseMailboxNumberReference(staleReference)).toThrow(
      "belongs to another mailbox",
    );
  });
});


it("revokes both MCP permission levels immediately from local entitlement state", async () => {
  const { getLicenseStatus } = await import("../main/services/settings");
  const { hasReadAccess, hasWriteAccess, readAccessError, writeAccessError } = await import("./runtime");
  expect(await hasReadAccess()).toBe(true);
  expect(await hasWriteAccess()).toBe(true);
  vi.mocked(getLicenseStatus).mockResolvedValue({ active: false });
  expect(await hasReadAccess()).toBe(false);
  expect(await hasWriteAccess()).toBe(false);
  expect((await readAccessError()).content[0].text).toBe("Pro required");
  expect((await writeAccessError()).content[0].text).toBe("Pro required");
  await expect(initializePaperweight()).rejects.toThrow("Pro required");
});

beforeEach(() => vi.stubEnv("PAPERWEIGHT_RESOURCES_DIR", "/tmp/paperweight-resources-test"));
afterEach(() => vi.unstubAllEnvs());
