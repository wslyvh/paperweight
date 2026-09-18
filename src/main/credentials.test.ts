import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let userDataDir = "";

const mockSafeStorage = {
  isEncryptionAvailable: jest.fn(() => false),
  encryptString: (value: string) => Buffer.from(value, "utf-8"),
  decryptString: (data: Buffer) => data.toString("utf-8"),
};

jest.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : "/tmp"),
  },
  safeStorage: mockSafeStorage,
}));

import {
  deleteCredentials,
  emailToFileKey,
  hasCredentials,
  loadCredentials,
  resetCredentialsModuleState,
  saveCredentials,
  setStagingMode,
  withCredentialAccount,
} from "./credentials";
import { resetGlobalSettingsCache } from "./services/globalSettings";

describe("credentials without active account", () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("loadCredentials returns undefined without throwing", () => {
    expect(loadCredentials()).toBeUndefined();
  });

  it("deleteCredentials no-ops without throwing and does not touch files", () => {
    const orphan = join(userDataDir, "orphan.enc");
    writeFileSync(orphan, "keep");

    expect(() => deleteCredentials()).not.toThrow();
    expect(existsSync(orphan)).toBe(true);
  });

  it("hasCredentials returns false", () => {
    expect(hasCredentials()).toBe(false);
  });

  it("loadCredentials with staging override works without active account", () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    saveCredentials(creds, "__staging__");

    expect(loadCredentials("__staging__")).toEqual(creds);
  });

  it("loadCredentials in staging mode uses staging file without active account", () => {
    const creds = { providerType: "microsoft" as const, microsoft: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    setStagingMode(true);
    saveCredentials(creds);

    expect(loadCredentials()).toEqual(creds);
  });
});

describe("credentials with active account", () => {
  const email = "user@example.com";

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ activeAccount: email }));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("loadCredentials returns undefined when credential file is missing", () => {
    expect(loadCredentials()).toBeUndefined();
  });

  it("saveCredentials and loadCredentials round-trip", () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    saveCredentials(creds);

    expect(loadCredentials()).toEqual(creds);
  });

  it("deleteCredentials removes the credential file", () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    saveCredentials(creds);
    const credPath = join(userDataDir, `${emailToFileKey(email)}.enc`);
    expect(existsSync(credPath)).toBe(true);

    deleteCredentials();

    expect(existsSync(credPath)).toBe(false);
  });

  it("scopes provider credential reads and refresh writes without changing the active account", async () => {
    const activeCredentials = {
      providerType: "gmail" as const,
      gmail: { accessToken: "active", refreshToken: "active-refresh", expiresAt: 1 },
    };
    const selectedCredentials = {
      providerType: "gmail" as const,
      gmail: { accessToken: "selected", refreshToken: "selected-refresh", expiresAt: 1 },
    };
    const selectedEmail = "selected@example.com";
    saveCredentials(activeCredentials);
    saveCredentials(selectedCredentials, selectedEmail);

    await withCredentialAccount(selectedEmail, async () => {
      expect(loadCredentials()).toEqual(selectedCredentials);
      saveCredentials({
        ...selectedCredentials,
        gmail: { ...selectedCredentials.gmail, accessToken: "refreshed" },
      });
    });

    expect(loadCredentials()).toEqual(activeCredentials);
    expect(loadCredentials(selectedEmail)?.gmail?.accessToken).toBe("refreshed");
  });
});

describe("loadCredentials plain-text fallback", () => {
  const email = "user@example.com";
  const creds = { providerType: "imap" as const, imap: { host: "imap.test", port: 993, tls: true, username: email, password: "x" } };

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    mockSafeStorage.decryptString = jest.fn(() => {
      throw new Error("not encrypted");
    });
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ activeAccount: email }));
    writeFileSync(join(userDataDir, `${emailToFileKey(email)}.enc`), JSON.stringify(creds), "utf-8");
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
    mockSafeStorage.decryptString = (data: Buffer) => data.toString("utf-8");
  });

  it("reads plain JSON when decrypt fails (dev fixtures, CI stored profile)", () => {
    expect(loadCredentials()).toEqual(creds);
  });
});
