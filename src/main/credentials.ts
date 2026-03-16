import { join } from "path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

export interface StoredCredentials {
  providerType: "gmail" | "imap" | "microsoft";
  gmail?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  microsoft?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  imap?: {
    host: string;
    port: number;
    tls: boolean;
    username: string;
    password: string;
    allowSelfSigned?: boolean;
  };
}

// ── Account registry ──────────────────────────────────────────────────────────

export interface AccountEntry {
  email: string;
  providerType: string;
  registeredAt?: number;
}

interface AccountRegistry {
  accounts: AccountEntry[];
  activeEmail?: string;
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().replace(/@/g, "-at-").replace(/\./g, "-");
}

function getRegistryPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  return join(app.getPath("userData"), "accounts.json");
}

function loadRegistry(): AccountRegistry {
  const path = getRegistryPath();
  if (!existsSync(path)) return { accounts: [] };
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AccountRegistry;
  } catch {
    return { accounts: [] };
  }
}

function saveRegistry(registry: AccountRegistry): void {
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), "utf-8");
}

export function listAccounts(): AccountEntry[] {
  return loadRegistry().accounts;
}

export function getActiveEmail(): string | undefined {
  return loadRegistry().activeEmail;
}

export function setActiveEmail(email: string): void {
  const registry = loadRegistry();
  registry.activeEmail = email;
  saveRegistry(registry);
}

export function registerAccount(email: string, providerType: string, registeredAt?: number): void {
  const registry = loadRegistry();
  const idx = registry.accounts.findIndex((a) => a.email === email);
  const entry: AccountEntry = { email, providerType, registeredAt };
  if (idx >= 0) {
    registry.accounts[idx] = entry;
  } else {
    registry.accounts.push(entry);
  }
  registry.activeEmail = email;
  saveRegistry(registry);
}

export function removeAccountEntry(email: string): void {
  const registry = loadRegistry();
  registry.accounts = registry.accounts.filter((a) => a.email !== email);
  if (registry.activeEmail === email) {
    registry.activeEmail = registry.accounts[0]?.email;
  }
  saveRegistry(registry);
}

// ── Credentials storage ───────────────────────────────────────────────────────

// undefined = not set (use safeStorage); null = explicitly no credentials
let _preloaded: StoredCredentials | null | undefined = undefined;

// When true, credentials are saved to/loaded from a staging file.
// Used during OAuth auth before the account email is known.
let _stagingMode = false;

export function setPreloadedCredentials(creds: StoredCredentials | null): void {
  _preloaded = creds;
}

export function setStagingMode(active: boolean): void {
  _stagingMode = active;
}

function getCredentialsPath(emailOverride?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  const email =
    emailOverride !== undefined
      ? emailOverride
      : _stagingMode
        ? "__staging__"
        : getActiveEmail();
  if (email) {
    return join(app.getPath("userData"), `credentials-${sanitizeEmail(email)}.enc`);
  }
  // Legacy fallback (before migration runs, or during very first account setup)
  return join(app.getPath("userData"), "credentials.enc");
}

export function saveCredentials(creds: StoredCredentials, emailOverride?: string) {
  if (_preloaded !== undefined) {
    // Worker thread context: safeStorage is not available in worker threads.
    // Update _preloaded in-memory so the current sync run sees refreshed tokens.
    // Disk persistence is skipped; the main thread reloads credentials on the next sync.
    _preloaded = creds;
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { safeStorage } = require("electron") as typeof import("electron");
  const json = JSON.stringify(creds);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    writeFileSync(getCredentialsPath(emailOverride), encrypted);
  } else {
    // Fallback: store as plain text (dev environments where encryption may not be available)
    writeFileSync(getCredentialsPath(emailOverride), json, "utf-8");
  }
}

export function loadCredentials(emailOverride?: string): StoredCredentials | undefined {
  if (_preloaded !== undefined) return _preloaded ?? undefined;

  // Main thread path — use safeStorage
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { safeStorage } = require("electron") as typeof import("electron");
  const path = getCredentialsPath(emailOverride);
  if (!existsSync(path)) return undefined;

  try {
    const data = readFileSync(path);
    if (safeStorage.isEncryptionAvailable()) {
      const json = safeStorage.decryptString(data);
      return JSON.parse(json) as StoredCredentials;
    } else {
      return JSON.parse(data.toString("utf-8")) as StoredCredentials;
    }
  } catch {
    return undefined;
  }
}

export function deleteCredentials(emailOverride?: string) {
  const path = getCredentialsPath(emailOverride);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function hasCredentials(emailOverride?: string) {
  return existsSync(getCredentialsPath(emailOverride));
}
