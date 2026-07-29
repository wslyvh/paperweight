import { loadCredentials } from "../credentials";
import { createGmailProvider } from "./gmail";
import { createImapProvider } from "./imap";
import { createMicrosoftProvider } from "./microsoft";
import type { AnalyzeOptions } from "@paperweight/analysis";
import type { EmailProvider } from "./types";

export function getProvider(analysisOptions?: AnalyzeOptions): EmailProvider {
  const creds = loadCredentials();
  if (!creds) throw new Error("No credentials configured");

  if (creds.providerType === "gmail") {
    return createGmailProvider(analysisOptions);
  } else if (creds.providerType === "imap") {
    return createImapProvider(analysisOptions);
  } else if (creds.providerType === "microsoft") {
    return createMicrosoftProvider(analysisOptions);
  }

  throw new Error(`Unknown provider type: ${creds.providerType}`);
}
