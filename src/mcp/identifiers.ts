import { getSelectedMailbox } from "./runtime";

export function mailboxReference(
  value: string | number,
  mailbox = getSelectedMailbox(),
): string {
  return `${mailbox}:${String(value)}`;
}

export function parseMailboxReference(reference: string): string {
  const prefix = `${getSelectedMailbox()}:`;
  if (!reference.startsWith(prefix)) {
    throw new Error("That reference belongs to another mailbox.");
  }
  const value = reference.slice(prefix.length);
  if (!value) throw new Error("Invalid mailbox reference.");
  return value;
}

export function parseMailboxNumberReference(reference: string): number {
  const value = Number(parseMailboxReference(reference));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid mailbox reference.");
  }
  return value;
}
