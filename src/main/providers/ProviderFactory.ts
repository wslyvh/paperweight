import { loadCredentials } from "../credentials";
import { createGmailProvider } from "./gmail";
import { createImapProvider } from "./imap";
import { createMicrosoftProvider } from "./microsoft";
import type { EmailProvider } from "./types";

export function getProvider(): EmailProvider {
  const creds = loadCredentials();
  if (!creds) throw new Error("No credentials configured");

  if (creds.providerType === "gmail") {
    return createGmailProvider();
  } else if (creds.providerType === "imap") {
    return createImapProvider();
  } else if (creds.providerType === "microsoft") {
    return createMicrosoftProvider();
  }

  throw new Error(`Unknown provider type: ${creds.providerType}`);
}
