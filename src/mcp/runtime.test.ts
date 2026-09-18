const mockReconnectDb = jest.fn();
const mockWithAccountDbReadConnection = jest.fn((_path: string, read: (database: unknown) => unknown) =>
  read({}),
);

jest.mock("fs", () => ({ existsSync: jest.fn(() => true) }));
jest.mock("../main/credentials", () => ({
  configureAccountRegistryPath: jest.fn(),
  emailToFileKey: jest.fn((email: string) => email.replace("@", "_")),
  listAccounts: jest.fn(() => [
    { email: "first@example.test", providerType: "gmail" },
    { email: "second@example.test", providerType: "gmail" },
  ]),
}));
jest.mock("../main/db", () => ({
  getDb: jest.fn(),
  initDb: jest.fn(),
  reconnectDb: mockReconnectDb,
  withAccountDbReadConnection: mockWithAccountDbReadConnection,
}));
jest.mock("../main/globalDb", () => ({ configureGlobalDbPath: jest.fn() }));
jest.mock("../main/services/globalSettings", () => ({
  getGlobalSetting: jest.fn((key: string) => {
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
    jest.clearAllMocks();
  });

  it("prevents account database switches until an async action finishes", async () => {
    initializePaperweight();
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

  it("reads list_mailboxes summaries without reconnecting the selected database", () => {
    initializePaperweight();

    expect(readMailboxDatabase("second@example.test", () => "summary")).toBe("summary");
    expect(mockWithAccountDbReadConnection).toHaveBeenCalledWith(
      expect.stringContaining("second_example.test.db"),
      expect.any(Function),
    );
    expect(mockReconnectDb).not.toHaveBeenCalled();
  });

  it("rejects a write argument from the previously selected mailbox", () => {
    initializePaperweight();
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
