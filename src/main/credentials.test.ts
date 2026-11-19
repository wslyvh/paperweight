import { STORAGE_READ_ERROR } from "../shared/secureStorage";
import { vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let userDataDir = vi.hoisted(() => (""));

const mockSafeStorage = vi.hoisted(() => ({
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: async (value: string) => Buffer.from(value, "utf-8"),
  decryptStringAsync: async (data: Buffer) => ({ result: data.toString("utf-8"), shouldReEncrypt: false }),
}));

vi.mock("electron", () => ({
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
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    resetGlobalSettingsCache();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("loadCredentials returns undefined without throwing", async () => {
    expect(await loadCredentials()).toBeUndefined();
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

  it("loadCredentials with staging override works without active account", async () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    await saveCredentials(creds, "__staging__");

    expect(await loadCredentials("__staging__")).toEqual(creds);
  });

  it("loadCredentials in staging mode uses staging file without active account", async () => {
    const creds = { providerType: "microsoft" as const, microsoft: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    setStagingMode(true);
    await saveCredentials(creds);

    expect(await loadCredentials()).toEqual(creds);
  });
});

describe("credentials with active account", () => {
  const email = "user@example.com";

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ activeAccount: email }));
  });

  afterEach(() => {
    resetGlobalSettingsCache();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("loadCredentials returns undefined when credential file is missing", async () => {
    expect(await loadCredentials()).toBeUndefined();
  });

  it("saveCredentials and loadCredentials round-trip", async () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    await saveCredentials(creds);

    expect(await loadCredentials()).toEqual(creds);
  });

  it("deleteCredentials removes the credential file", async () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    await saveCredentials(creds);
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
    await saveCredentials(activeCredentials);
    await saveCredentials(selectedCredentials, selectedEmail);

    await withCredentialAccount(selectedEmail, async () => {
      expect(await loadCredentials()).toEqual(selectedCredentials);
      await saveCredentials({
        ...selectedCredentials,
        gmail: { ...selectedCredentials.gmail, accessToken: "refreshed" },
      });
    });

    expect(await loadCredentials()).toEqual(activeCredentials);
    expect((await loadCredentials(selectedEmail))?.gmail?.accessToken).toBe("refreshed");
  });
});

describe("loadCredentials rejects plaintext", () => {
  const email = "user@example.com";
  const creds = { providerType: "imap" as const, imap: { host: "imap.test", port: 993, tls: true, username: email, password: "x" } };

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
    mockSafeStorage.decryptStringAsync = vi.fn(async () => {
      throw new Error("not encrypted");
    });
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ activeAccount: email }));
    writeFileSync(join(userDataDir, `${emailToFileKey(email)}.enc`), JSON.stringify(creds), "utf-8");
  });

  afterEach(() => {
    resetGlobalSettingsCache();
    rmSync(userDataDir, { recursive: true, force: true });
    mockSafeStorage.decryptStringAsync = async (data: Buffer) => ({ result: data.toString("utf-8"), shouldReEncrypt: false });
  });

  it("rejects plain JSON when decryption fails", async () => {
    await expect(loadCredentials()).rejects.toThrow(STORAGE_READ_ERROR);
  });
});
