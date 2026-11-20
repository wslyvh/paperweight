import { getElectron } from "./electronRuntime";
import { join } from "path";
import { createHash } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

import { readSecureFile, writeSecureFile } from "./secureStorage";
import { encryptAccountRegistry, decryptAccountRegistry } from "./databaseEncryption";

import { getGlobalSetting, saveGlobalSetting } from "./services/globalSettings";

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
    smtp?: {
      host: string;
      port: number;
      tls: boolean;
    };
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
}

let _accountRegistryPath: string | undefined;

export function emailToFileKey(email: string): string {
  const normalized = email.toLowerCase();
  const local = normalized.split("@")[0].replace(/[^a-z0-9.-]/g, "_");
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 6);
  return `${local}_${hash}`;
}

/** Short privacy-safe account identifier for logging (6-char hash, matches filename suffix). */
export function accountTag(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 6);
}

function getRegistryPath(): string {
  if (_accountRegistryPath) return _accountRegistryPath;
  const { app } = getElectron();
  return join(app.getPath("userData"), "accounts.json");
}

export function configureAccountRegistryPath(path: string): void {
  _accountRegistryPath = path;
}

function loadRegistry(): AccountRegistry {
  const path = getRegistryPath();
  if (!existsSync(path)) return { accounts: [] };
  return JSON.parse(decryptAccountRegistry(readFileSync(path, "utf-8"))) as AccountRegistry;
}

function saveRegistry(registry: AccountRegistry): void {
  writeFileSync(getRegistryPath(), encryptAccountRegistry(JSON.stringify(registry)), { mode: 0o600 });
}

export function migrateAccountRegistry(): void {
  const path = getRegistryPath();
  if (!existsSync(path)) return;
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(value.accounts)) saveRegistry(value as AccountRegistry);
  else loadRegistry(); // Validate existing ciphertext before accepting startup.
}

export function listAccounts(): AccountEntry[] {
  return loadRegistry().accounts;
}

export function getActiveEmail(): string | undefined {
  return getGlobalSetting("activeAccount");
}

export function setActiveEmail(email: string): void {
  saveGlobalSetting("activeAccount", email);
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
  saveRegistry(registry);
  setActiveEmail(email);
}

export function removeAccountEntry(email: string): void {
  const registry = loadRegistry();
  registry.accounts = registry.accounts.filter((a) => a.email !== email);
  saveRegistry(registry);
  if (getActiveEmail() === email) {
    saveGlobalSetting("activeAccount", registry.accounts[0]?.email);
  }
}

// ── Credentials storage ───────────────────────────────────────────────────────

// undefined = not set (use safeStorage); null = explicitly no credentials
let _preloaded: StoredCredentials | null | undefined = undefined;
let _persistPreloaded: ((creds: StoredCredentials) => Promise<void>) | undefined;

// When true, credentials are saved to/loaded from a staging file.
// Used during OAuth auth before the account email is known.
let _stagingMode = false;
const credentialAccount = new AsyncLocalStorage<string>();

/** Runs provider work against one account without changing the App-active account. */
export function withCredentialAccount<T>(
  email: string,
  action: () => Promise<T>,
): Promise<T> {
  return credentialAccount.run(email, action);
}

export function setPreloadedCredentials(creds: StoredCredentials | null, persist?: (creds: StoredCredentials) => Promise<void>): void {
  _preloaded = creds;
  _persistPreloaded = persist;
}

export function setStagingMode(active: boolean): void {
  _stagingMode = active;
}

/** Resets in-memory credential state (for tests). */
export function resetCredentialsModuleState(): void {
  _preloaded = undefined;
  _persistPreloaded = undefined;
  _stagingMode = false;
  _accountRegistryPath = undefined;
}

function getCredentialsPath(emailOverride?: string): string {
  const { app } = getElectron();
  const email =
    emailOverride !== undefined
      ? emailOverride
      : _stagingMode
        ? "__staging__"
        : credentialAccount.getStore() ?? getActiveEmail();
  if (email === "__staging__") {
    return join(app.getPath("userData"), "__staging__.enc");
  }
  if (!email) throw new Error("No active account");
  return join(app.getPath("userData"), `${emailToFileKey(email)}.enc`);
}

export async function saveCredentials(creds: StoredCredentials, emailOverride?: string) {
  if (_preloaded !== undefined) {
    if (_persistPreloaded) await _persistPreloaded(creds);
    _preloaded = creds;
    return;
  }
  const path = getCredentialsPath(emailOverride);
  await writeSecureFile(path, creds);
}

export async function loadCredentials(emailOverride?: string): Promise<StoredCredentials | undefined> {
  if (_preloaded !== undefined) return _preloaded ?? undefined;
  if (!emailOverride && !_stagingMode && !credentialAccount.getStore() && !getActiveEmail()) return undefined;
  return readSecureFile<StoredCredentials>(getCredentialsPath(emailOverride));
}

export function deleteCredentials(emailOverride?: string) {
  if (
    !emailOverride
    && !_stagingMode
    && !credentialAccount.getStore()
    && !getActiveEmail()
  ) return undefined;
  const path = getCredentialsPath(emailOverride);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function hasCredentials(emailOverride?: string) {
  if (
    !emailOverride
    && !_stagingMode
    && !credentialAccount.getStore()
    && !getActiveEmail()
  ) return false;
  return existsSync(getCredentialsPath(emailOverride));
}
