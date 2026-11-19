export const STORAGE_SAVE_ERROR = "Paperweight couldn't access your computer's secure storage to save your sign-in details.";
export const STORAGE_READ_ERROR = "Paperweight couldn't access your computer's secure storage to read your saved sign-in details.";

// IPC exceptions may prefix the original message with the channel name.
export function isStorageError(message: string) {
  return message.includes(STORAGE_SAVE_ERROR) || message.includes(STORAGE_READ_ERROR);
}
