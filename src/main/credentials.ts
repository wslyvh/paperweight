import { join } from "path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

export interface StoredCredentials {
  providerType: "gmail" | "imap" | "microsoft";
  gmail?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    grantedScopes?: string;
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

// undefined = not set (use safeStorage); null = explicitly no credentials
let _preloaded: StoredCredentials | null | undefined = undefined;

export function setPreloadedCredentials(creds: StoredCredentials | null): void {
  _preloaded = creds;
}

function getCredentialsPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  return join(app.getPath("userData"), "credentials.enc");
}

export function saveCredentials(creds: StoredCredentials) {
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
    writeFileSync(getCredentialsPath(), encrypted);
  } else {
    // Fallback: store as plain text (dev environments where encryption may not be available)
    writeFileSync(getCredentialsPath(), json, "utf-8");
  }
}

export function loadCredentials(): StoredCredentials | undefined {
  if (_preloaded !== undefined) return _preloaded ?? undefined;

  // Main thread path — use safeStorage
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { safeStorage } = require("electron") as typeof import("electron");
  const path = getCredentialsPath();
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

export function deleteCredentials() {
  const path = getCredentialsPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function hasCredentials() {
  return existsSync(getCredentialsPath());
}
