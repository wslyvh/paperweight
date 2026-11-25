import { STORAGE_READ_ERROR, STORAGE_SAVE_ERROR } from "../shared/secureStorage";
import { getElectron } from "./electronRuntime";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

// Upgrade cleanup only: never use these plaintext values as credentials.
export function removeLegacyPlaintextFile(path: string, kind: "credentials" | "license") {
  if (!existsSync(path)) return;
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return; // Encrypted or unrecognized files must survive, even if storage is locked.
  }
  if (!value || typeof value !== "object") return;
  const recognized = kind === "license"
    ? typeof value.key === "string"
    : (value.providerType === "imap" && typeof value.imap?.password === "string")
      || (value.providerType === "gmail" && typeof value.gmail?.accessToken === "string")
      || (value.providerType === "microsoft" && typeof value.microsoft?.accessToken === "string");
  if (recognized) unlinkSync(path);
}

export class SecureStorageError extends Error {
  constructor(action: "read" | "save") {
    super(action === "save" ? STORAGE_SAVE_ERROR : STORAGE_READ_ERROR);
    this.name = "SecureStorageError";
  }
}

async function encrypt(value: unknown) {
  const { safeStorage } = getElectron();
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new SecureStorageError("save");
  return safeStorage.encryptStringAsync(JSON.stringify(value));
}

export async function writeSecureFile(path: string, value: unknown) {
  try {
    // Encrypt before opening the file: unavailable encryption must preserve it.
    const encrypted = await encrypt(value);
    writeFileSync(path, encrypted, { mode: 0o600 });
  } catch {
    // Never expose a provider error that might include the plaintext input.
    throw new SecureStorageError("save");
  }
}

export async function readSecureFile<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    const { safeStorage } = getElectron();
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new SecureStorageError("read");
    const data = readFileSync(path);
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(data);
    const value = JSON.parse(result) as T;
    if (shouldReEncrypt) {
      const encrypted = await encrypt(value);
      // A delete or newer save may have completed while encryption was pending.
      // Keep the comparison and write synchronous, with no await between them.
      if (existsSync(path) && readFileSync(path).equals(data)) {
        writeFileSync(path, encrypted, { mode: 0o600 });
      }
    }
    return value;
  } catch {
    throw new SecureStorageError("read");
  }
}
