const mockLoadCredentials = jest.fn();
const mockSaveCredentials = jest.fn();
const mockDeleteCredentials = jest.fn();
const mockSetStagingMode = jest.fn();
const mockRegisterAccount = jest.fn();
const mockListAccounts = jest.fn();
const mockGetActiveEmail = jest.fn();
const mockStartLoopbackAuth = jest.fn();
const mockFetchGmailProfileEmail = jest.fn();
const mockStartMicrosoftLoopbackAuth = jest.fn();
const mockFetchMicrosoftProfileEmail = jest.fn();
const mockTestImapConnection = jest.fn();
const mockTestSmtpConnection = jest.fn();
const mockCreateAccountDb = jest.fn();
const mockReconnectDb = jest.fn();
const mockGetProvider = jest.fn();

jest.mock("../credentials", () => ({
  loadCredentials: mockLoadCredentials,
  saveCredentials: mockSaveCredentials,
  deleteCredentials: mockDeleteCredentials,
  hasCredentials: jest.fn(),
  setStagingMode: mockSetStagingMode,
  registerAccount: mockRegisterAccount,
  listAccounts: mockListAccounts,
  getActiveEmail: mockGetActiveEmail,
  emailToFileKey: jest.fn(() => "account"),
  accountTag: jest.fn(() => "tag"),
}));

jest.mock("../providers/gmail", () => ({
  startLoopbackAuth: mockStartLoopbackAuth,
  fetchGmailProfileEmail: mockFetchGmailProfileEmail,
}));

jest.mock("../providers/microsoft", () => ({
  startMicrosoftLoopbackAuth: mockStartMicrosoftLoopbackAuth,
  fetchMicrosoftProfileEmail: mockFetchMicrosoftProfileEmail,
}));

jest.mock("../providers/imap", () => ({
  testImapConnection: mockTestImapConnection,
}));
jest.mock("../providers/smtp", () => ({
  testSmtpConnection: mockTestSmtpConnection,
}));
jest.mock("../providers/ProviderFactory", () => ({ getProvider: mockGetProvider }));
jest.mock("./settings", () => ({
  addWhitelistEntry: jest.fn(),
  getSetting: jest.fn(),
  saveSetting: jest.fn(),
  applyAutoLaunch: jest.fn(),
}));
jest.mock("./globalSettings", () => ({ saveGlobalSetting: jest.fn() }));
jest.mock("./stats", () => ({ getDashboardStats: jest.fn() }));
jest.mock("./sync", () => ({ getSyncState: jest.fn() }));
jest.mock("./messages", () => ({
  getMessageIdsByVendor: jest.fn(),
  deleteVendorMessages: jest.fn(),
  insertActionLog: jest.fn(),
}));
jest.mock("./vendors", () => ({
  updateVendorFlags: jest.fn(),
  updateVendorStats: jest.fn(),
}));
jest.mock("../db", () => ({
  createAccountDb: mockCreateAccountDb,
  getDb: jest.fn(),
  reconnectDb: mockReconnectDb,
}));
jest.mock("../utils/log", () => ({
  authLog: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  actionLog: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("./profileSeed", () => ({
  seedProfileEmailsFromCurrentAccount: jest.fn(),
}));

import {
  startGmailAuthAndRecordAccount,
  startMicrosoftAuthAndRecordAccount,
  saveImapConfigAndRecordAccount,
  trashVendorMessages,
} from "./account";
import {
  deleteVendorMessages,
  getMessageIdsByVendor,
  insertActionLog,
} from "./messages";
import { updateVendorFlags, updateVendorStats } from "./vendors";

describe("account authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    ).rejects.toThrow("OAuth crashed");

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
    ).rejects.toThrow("OAuth crashed");

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
    jest.clearAllMocks();
  });

  it("keeps an action open until provider and local writes complete", async () => {
    let releaseTrash: (() => void) | undefined;
    const trashFinished = new Promise<void>((resolve) => {
      releaseTrash = resolve;
    });
    const provider = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      trashMessage: jest.fn(() => trashFinished),
    };
    mockGetProvider.mockReturnValue(provider);
    jest.mocked(getMessageIdsByVendor).mockReturnValue(["message-1"]);
    jest.mocked(deleteVendorMessages).mockReturnValue({ count: 1, sizeBytes: 100 });

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
    expect(insertActionLog).toHaveBeenCalledWith(7, "trashed", 1, 100);
  });

  it("keeps local records when a provider action fails", async () => {
    const provider = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      trashMessage: jest.fn().mockRejectedValue(new Error("Provider rejected action")),
    };
    mockGetProvider.mockReturnValue(provider);
    jest.mocked(getMessageIdsByVendor).mockReturnValue(["message-1"]);

    await expect(trashVendorMessages(7)).resolves.toEqual({
      success: false,
      error: "One or more mailbox operations failed. Local records were kept.",
    });
    expect(deleteVendorMessages).not.toHaveBeenCalled();
    expect(insertActionLog).not.toHaveBeenCalled();
  });
});
