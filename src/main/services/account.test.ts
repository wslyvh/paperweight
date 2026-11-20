import { vi } from "vitest";
const mockRequirePro = vi.hoisted(() => (vi.fn()));
const mockLoadCredentials = vi.hoisted(() => (vi.fn()));
const mockSaveCredentials = vi.hoisted(() => (vi.fn()));
const mockDeleteCredentials = vi.hoisted(() => (vi.fn()));
const mockSetStagingMode = vi.hoisted(() => (vi.fn()));
const mockRegisterAccount = vi.hoisted(() => (vi.fn()));
const mockListAccounts = vi.hoisted(() => (vi.fn()));
const mockGetActiveEmail = vi.hoisted(() => (vi.fn()));
const mockStartLoopbackAuth = vi.hoisted(() => (vi.fn()));
const mockFetchGmailProfileEmail = vi.hoisted(() => (vi.fn()));
const mockStartMicrosoftLoopbackAuth = vi.hoisted(() => (vi.fn()));
const mockFetchMicrosoftProfileEmail = vi.hoisted(() => (vi.fn()));
const mockTestImapConnection = vi.hoisted(() => (vi.fn()));
const mockTestSmtpConnection = vi.hoisted(() => (vi.fn()));
const mockCreateAccountDb = vi.hoisted(() => (vi.fn()));
const mockReconnectDb = vi.hoisted(() => (vi.fn()));
const mockGetProvider = vi.hoisted(() => (vi.fn()));

vi.mock("../credentials", () => ({
  loadCredentials: mockLoadCredentials,
  saveCredentials: mockSaveCredentials,
  deleteCredentials: mockDeleteCredentials,
  hasCredentials: vi.fn(),
  setStagingMode: mockSetStagingMode,
  registerAccount: mockRegisterAccount,
  listAccounts: mockListAccounts,
  getActiveEmail: mockGetActiveEmail,
  emailToFileKey: vi.fn(() => "account"),
  accountTag: vi.fn(() => "tag"),
}));

vi.mock("../providers/gmail", () => ({
  startLoopbackAuth: mockStartLoopbackAuth,
  fetchGmailProfileEmail: mockFetchGmailProfileEmail,
}));

vi.mock("../providers/microsoft", () => ({
  startMicrosoftLoopbackAuth: mockStartMicrosoftLoopbackAuth,
  fetchMicrosoftProfileEmail: mockFetchMicrosoftProfileEmail,
}));

vi.mock("../providers/imap", () => ({
  testImapConnection: mockTestImapConnection,
}));
vi.mock("../providers/smtp", () => ({
  testSmtpConnection: mockTestSmtpConnection,
}));
vi.mock("../providers/ProviderFactory", () => ({ getProvider: mockGetProvider }));
vi.mock("./settings", () => ({ requirePro: mockRequirePro,
  addWhitelistEntry: vi.fn(),
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
  applyAutoLaunch: vi.fn(),
}));
vi.mock("./globalSettings", () => ({ saveGlobalSetting: vi.fn() }));
vi.mock("./stats", () => ({ getDashboardStats: vi.fn() }));
vi.mock("./sync", () => ({ getSyncState: vi.fn() }));
vi.mock("./messages", () => ({
  getMessageIdsByVendor: vi.fn(),
  deleteVendorMessages: vi.fn(),
  insertActionLog: vi.fn(),
}));
vi.mock("./vendors", () => ({
  updateVendorFlags: vi.fn(),
  updateVendorStats: vi.fn(),
}));
vi.mock("../db", () => ({
  createAccountDb: mockCreateAccountDb,
  getDb: vi.fn(),
  reconnectDb: mockReconnectDb,
}));
vi.mock("../utils/log", () => ({
  authLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  actionLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("./profileSeed", () => ({
  seedProfileEmailsFromCurrentAccount: vi.fn(),
}));

import {
  startGmailAuthAndRecordAccount,
  startMicrosoftAuthAndRecordAccount,
  saveImapConfigAndRecordAccount,
  trashVendorMessages,
  trashMessage,
  markMessageAsSpam,
  markMessageAsRead,
  spamVendorMessages,
} from "./account";
import {
  deleteVendorMessages,
  getMessageIdsByVendor,
  insertActionLog,
} from "./messages";
import { updateVendorFlags, updateVendorStats } from "./vendors";

describe("account authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartLoopbackAuth.mockResolvedValue({ success: true });
    mockLoadCredentials.mockReturnValue({
      providerType: "gmail",
      gmail: { accessToken: "access", refreshToken: "refresh", expiresAt: 123 },
    });
    mockFetchGmailProfileEmail.mockResolvedValue("existing@example.com");
    mockTestImapConnection.mockResolvedValue({ success: true });
    mockTestSmtpConnection.mockResolvedValue({ success: true });
    mockListAccounts.mockReturnValue([{
      email: "existing@example.com",
      providerType: "gmail",
      registeredAt: 123,
    }]);
    mockGetActiveEmail.mockReturnValue("other@example.com");
  });

  it("does not persist or register an existing account returned by Add", async () => {
    const result = await startGmailAuthAndRecordAccount({ type: "add" }, true);

    expect(result).toEqual({
      success: false,
      error: "This account is already connected. Use Reconnect instead.",
    });
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
    expect(mockDeleteCredentials).toHaveBeenCalledWith("__staging__");
  });

  it("updates credentials without registering during an exact reconnect", async () => {
    mockGetActiveEmail.mockReturnValue("existing@example.com");

    const result = await startGmailAuthAndRecordAccount(
      { type: "reconnect", email: "existing@example.com" },
      true,
    );

    expect(result).toEqual({ success: true });
    expect(mockSaveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ providerType: "gmail" }),
      "existing@example.com",
    );
    expect(mockRegisterAccount).not.toHaveBeenCalled();
    expect(mockCreateAccountDb).not.toHaveBeenCalled();
    expect(mockReconnectDb).not.toHaveBeenCalled();
    expect(mockDeleteCredentials).toHaveBeenCalledWith("__staging__");
  });

  it("does not persist or register an existing Microsoft account returned by Add", async () => {
    mockStartMicrosoftLoopbackAuth.mockResolvedValue({ success: true });
    mockLoadCredentials.mockReturnValue({
      providerType: "microsoft",
      microsoft: { accessToken: "access", refreshToken: "refresh", expiresAt: 123 },
    });
    mockFetchMicrosoftProfileEmail.mockResolvedValue("existing@example.com");

    const result = await startMicrosoftAuthAndRecordAccount(
      { type: "add" },
      true,
    );

    expect(result).toEqual({
      success: false,
      error: "This account is already connected. Use Reconnect instead.",
    });
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
    expect(mockDeleteCredentials).toHaveBeenCalledWith("__staging__");
  });

  it("cleans up staging when Gmail auth throws", async () => {
    mockStartLoopbackAuth.mockRejectedValue(new Error("OAuth crashed"));

    await expect(
      startGmailAuthAndRecordAccount({ type: "add" }, true),
    ).resolves.toEqual({ success: false, error: "OAuth crashed" });

    expect(mockSetStagingMode).toHaveBeenNthCalledWith(1, true);
    expect(mockSetStagingMode).toHaveBeenLastCalledWith(false);
    expect(mockDeleteCredentials).toHaveBeenCalledWith("__staging__");
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
  });

  it("cleans up staging when Microsoft auth throws", async () => {
    mockStartMicrosoftLoopbackAuth.mockRejectedValue(new Error("OAuth crashed"));

    await expect(
      startMicrosoftAuthAndRecordAccount({ type: "add" }, true),
    ).resolves.toEqual({ success: false, error: "OAuth crashed" });

    expect(mockSetStagingMode).toHaveBeenNthCalledWith(1, true);
    expect(mockSetStagingMode).toHaveBeenLastCalledWith(false);
    expect(mockDeleteCredentials).toHaveBeenCalledWith("__staging__");
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
  });

  it("rejects an existing IMAP account before testing or persisting it", async () => {
    const result = await saveImapConfigAndRecordAccount({ type: "add" }, {
      host: "imap.example.com",
      port: 993,
      tls: true,
      username: "existing@example.com",
      password: "secret",
      smtp: {
        host: "smtp.example.com",
        port: 465,
        tls: true,
      },
    });

    expect(result).toEqual({
      success: false,
      error: "This account is already connected. Use Reconnect instead.",
    });
    expect(mockTestImapConnection).not.toHaveBeenCalled();
    expect(mockTestSmtpConnection).not.toHaveBeenCalled();
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
  });

  it("refreshes IMAP credentials without registering during reconnect", async () => {
    mockListAccounts.mockReturnValue([{
      email: "existing@example.com",
      providerType: "imap",
      registeredAt: 123,
    }]);
    mockGetActiveEmail.mockReturnValue("existing@example.com");
    const config = {
      host: "imap.example.com",
      port: 993,
      tls: true,
      username: "existing@example.com",
      password: "new-app-password",
      smtp: {
        host: "smtp.example.com",
        port: 465,
        tls: true,
      },
    };

    const result = await saveImapConfigAndRecordAccount(
      { type: "reconnect", email: "existing@example.com" },
      config,
    );

    expect(result).toEqual({ success: true });
    expect(mockTestImapConnection).toHaveBeenCalledWith(config);
    expect(mockTestSmtpConnection).toHaveBeenCalled();
    expect(mockSaveCredentials).toHaveBeenCalledWith(
      { providerType: "imap", imap: config },
      "existing@example.com",
    );
    expect(mockRegisterAccount).not.toHaveBeenCalled();
    expect(mockCreateAccountDb).not.toHaveBeenCalled();
    expect(mockReconnectDb).not.toHaveBeenCalled();
  });
});

describe("bulk account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps an action open until provider and local writes complete", async () => {
    let releaseTrash: (() => void) | undefined;
    const trashFinished = new Promise<void>((resolve) => {
      releaseTrash = resolve;
    });
    const provider = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      trashMessage: vi.fn(() => trashFinished),
    };
    mockGetProvider.mockReturnValue(provider);
    vi.mocked(getMessageIdsByVendor).mockReturnValue(["message-1"]);
    vi.mocked(deleteVendorMessages).mockReturnValue({ count: 1, sizeBytes: 100 });

    let settled = false;
    const action = trashVendorMessages(7).then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);
    expect(provider.trashMessage).toHaveBeenCalledWith("message-1");
    expect(deleteVendorMessages).not.toHaveBeenCalled();

    releaseTrash?.();
    await expect(action).resolves.toEqual({ success: true });
    expect(deleteVendorMessages).toHaveBeenCalledWith(7, undefined);
    expect(updateVendorStats).toHaveBeenCalledWith(7);
    expect(updateVendorFlags).toHaveBeenCalledWith(7);
    expect(insertActionLog).toHaveBeenCalledWith(7, "trashed", 1, 0);
  });

  it("keeps local records when a provider action fails", async () => {
    const provider = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      trashMessage: vi.fn().mockRejectedValue(new Error("Provider rejected action")),
    };
    mockGetProvider.mockReturnValue(provider);
    vi.mocked(getMessageIdsByVendor).mockReturnValue(["message-1"]);

    await expect(trashVendorMessages(7)).resolves.toEqual({
      success: false,
      error: "One or more mailbox operations failed. Local records were kept.",
    });
    expect(deleteVendorMessages).not.toHaveBeenCalled();
    expect(insertActionLog).not.toHaveBeenCalled();
  });
});


describe("Free account creation and cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAccounts.mockReturnValue([{ email: "existing@example.com", providerType: "gmail" }]);
    mockRequirePro.mockImplementation(() => { throw new Error("Pro required"); });
  });
  afterEach(() => mockRequirePro.mockReset());

  it("blocks direct Gmail, Microsoft, and IMAP adds before credentials can be saved", async () => {
    await expect(startGmailAuthAndRecordAccount({ type: "add" })).resolves.toEqual({ success: false, error: "Pro required" });
    await expect(startMicrosoftAuthAndRecordAccount({ type: "add" })).resolves.toEqual({ success: false, error: "Pro required" });
    await expect(saveImapConfigAndRecordAccount({ type: "add" }, {
      host: "imap.example.test", port: 993, tls: true, username: "second@example.test", password: "test-only",
    })).resolves.toEqual({ success: false, error: "Pro required" });
    expect(mockStartLoopbackAuth).not.toHaveBeenCalled();
    expect(mockStartMicrosoftLoopbackAuth).not.toHaveBeenCalled();
    expect(mockTestImapConnection).not.toHaveBeenCalled();
    expect(mockSaveCredentials).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["trash", () => trashMessage("message-1")],
    ["spam", () => markMessageAsSpam("message-1")],
    ["mark read", () => markMessageAsRead("message-1", true)],
    ["bulk spam", () => spamVendorMessages(1)],
  ])("blocks direct %s before contacting a provider", async (_name, action) => {
    await expect(action()).rejects.toThrow("Pro required");
    expect(mockGetProvider).not.toHaveBeenCalled();
  });

  it("blocks bulk trash before contacting a provider or changing local state", async () => {
    await expect(trashVendorMessages(1)).rejects.toThrow("Pro required");
    expect(mockGetProvider).not.toHaveBeenCalled();
    expect(deleteVendorMessages).not.toHaveBeenCalled();
  });
});
