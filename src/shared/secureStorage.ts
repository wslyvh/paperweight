export const STORAGE_SAVE_ERROR = "Paperweight couldn't access your computer's secure storage to save your sign-in details.";
export const STORAGE_READ_ERROR = "Paperweight couldn't access your computer's secure storage to read your saved sign-in details.";
export const STORAGE_UNAVAILABLE_ERROR = "Paperweight couldn't access your computer's secure storage.";
export const DATA_UNLOCK_ERROR = "Paperweight couldn't unlock your local data.";

export type StorageState = "ready" | "unavailable" | "locked" | "busy" | "failed";

export function storageFailureState(error: unknown): StorageState {
  if (error instanceof Error && error.message === STORAGE_UNAVAILABLE_ERROR) return "unavailable";
  if (error instanceof Error && error.message === DATA_UNLOCK_ERROR) return "locked";
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return "busy";
  if (code === "SQLITE_NOTADB") return "locked";
  return "failed";
}

export function secureStorageHelpUrl(platform: string) {
  return platform === "linux"
    ? "https://help.gnome.org/seahorse/keyring.html"
    : platform === "darwin"
      ? "https://support.apple.com/guide/keychain-access/mac-keychain-password-kyca1242/mac"
      : "https://github.com/wslyvh/paperweight/issues";
}

// IPC exceptions may prefix the original message with the channel name.
export function isStorageError(message: string) {
  return message.includes(STORAGE_SAVE_ERROR) || message.includes(STORAGE_READ_ERROR)
    || message.includes(STORAGE_UNAVAILABLE_ERROR);
}
