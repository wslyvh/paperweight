import type { AccountEntry, StoredCredentials } from "../credentials";
import type { AccountAuthIntent } from "@shared/types";

export type AccountIntentResult =
  | { success: true }
  | { success: false; error: string };

function isSameEmail(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function validateAccountIntent(
  intent: AccountAuthIntent,
  resolvedEmail: string,
  providerType: StoredCredentials["providerType"],
  accounts: AccountEntry[],
  activeEmail?: string,
): AccountIntentResult {
  if (
    intent.type === "add"
    && accounts.some((account) => isSameEmail(account.email, resolvedEmail))
  ) {
    return {
      success: false,
      error: "This account is already connected. Use Reconnect instead.",
    };
  }
  if (
    intent.type === "reconnect"
    && !isSameEmail(intent.email, resolvedEmail)
  ) {
    return {
      success: false,
      error: "Sign-in returned a different account. Try again with the account you are reconnecting.",
    };
  }
  if (
    intent.type === "reconnect"
    && (!activeEmail || !isSameEmail(intent.email, activeEmail))
  ) {
    return {
      success: false,
      error: "The account being reconnected is no longer active. Switch to it and try again.",
    };
  }
  const reconnectAccount = intent.type === "reconnect"
    ? accounts.find((account) => isSameEmail(account.email, intent.email))
    : undefined;
  if (intent.type === "reconnect" && !reconnectAccount) {
    return {
      success: false,
      error: "This account is no longer connected. Add it again instead.",
    };
  }
  if (reconnectAccount && reconnectAccount.providerType !== providerType) {
    return {
      success: false,
      error: "This account is connected through a different provider.",
    };
  }
  return { success: true };
}
