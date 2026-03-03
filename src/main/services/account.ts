import {
  loadCredentials,
  saveCredentials,
  hasCredentials,
} from "../credentials";
import { startLoopbackAuth } from "../providers/gmail";
import { startMicrosoftLoopbackAuth } from "../providers/microsoft";
import { testImapConnection } from "../providers/imap";
import { getProvider } from "../providers/ProviderFactory";
import { addWhitelistEntry, getSetting, saveSetting, applyAutoLaunch } from "./settings";
import { getDashboardStats } from "./stats";
import { getSyncState } from "./sync";
import {
  getMessageIdsByVendor,
  deleteVendorBulkMessages,
  insertActionLog,
} from "./messages";
import { APP_CONFIG } from "@shared/config";
import type { ImapConfig, AccountInfo, EmailConnection } from "@shared/types";
import { authLog, actionLog } from "../utils/log";

function autoWhitelist(email: string): void {
  addWhitelistEntry(email.toLowerCase());
  const domain = email.split("@")[1];
  if (domain && !APP_CONFIG.PERSONAL_DOMAINS.includes(domain.toLowerCase())) {
    addWhitelistEntry(domain);
  }
}

async function fetchGmailProfileEmail(accessToken: string) {
  try {
    const resp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) return undefined;
    const profile = (await resp.json()) as { emailAddress?: string };
    return profile.emailAddress;
  } catch {
    return undefined;
  }
}

export function getConnectionStatus() {
  return hasCredentials();
}

export async function startGmailAuthAndRecordAccount() {
  authLog.info("Gmail auth started");
  const result = await startLoopbackAuth(true);
  if (!result.success) {
    authLog.error("Gmail auth failed:", result.error);
    return result;
  }

  const creds = loadCredentials();
  if (creds?.gmail?.accessToken) {
    const email = await fetchGmailProfileEmail(creds.gmail.accessToken);
    if (email) {
      saveSetting("accountEmail", email);
      autoWhitelist(email);
    }
  }

  if (!getSetting("registeredAt")) {
    authLog.info("Account registered (first time setup)");
    saveSetting("registeredAt", String(Date.now()));
    saveSetting("autoLaunch", "true");
    saveSetting("launchMinimized", "true");
    applyAutoLaunch(true, true);
  }

  authLog.info("Gmail auth completed");
  return result;
}

export async function startMicrosoftAuthAndRecordAccount() {
  authLog.info("Microsoft auth started");
  const result = await startMicrosoftLoopbackAuth();
  if (!result.success) {
    authLog.error("Microsoft auth failed:", result.error);
    return result;
  }

  const creds = loadCredentials();
  if (creds?.microsoft?.accessToken) {
    try {
      const resp = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
        { headers: { Authorization: `Bearer ${creds.microsoft.accessToken}` } }
      );
      if (resp.ok) {
        const profile = (await resp.json()) as {
          mail?: string;
          userPrincipalName?: string;
        };
        const email = profile.mail || profile.userPrincipalName;
        if (email) {
          saveSetting("accountEmail", email);
          autoWhitelist(email);
        }
      }
    } catch {
      // Non-fatal — email just won't be pre-populated
    }
  }

  if (!getSetting("registeredAt")) {
    authLog.info("Account registered (first time setup)");
    saveSetting("registeredAt", String(Date.now()));
    saveSetting("autoLaunch", "true");
    saveSetting("launchMinimized", "true");
    applyAutoLaunch(true, true);
  }

  authLog.info("Microsoft auth completed");
  return result;
}

export async function saveImapConfigAndRecordAccount(config: ImapConfig) {
  try {
    const testResult = await testImapConnection(config);
    if (!testResult.success) {
      authLog.info("IMAP connection test failed");
      return testResult;
    }

    saveCredentials({
      providerType: "imap",
      imap: config,
    });

    authLog.info("IMAP config saved");
    saveSetting("accountEmail", config.username);
    autoWhitelist(config.username);
    if (!getSetting("registeredAt")) {
      authLog.info("Account registered (first time setup)");
      saveSetting("registeredAt", String(Date.now()));
      saveSetting("autoLaunch", "true");
      saveSetting("launchMinimized", "true");
      applyAutoLaunch(true, true);
    }

    return { success: true };
  } catch (err) {
    authLog.error("IMAP config save failed:", err instanceof Error ? err.message : String(err));
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testCurrentConnection() {
  const creds = loadCredentials();
  if (!creds) return { success: false, error: "No credentials stored" };

  if (creds.providerType === "imap" && creds.imap) {
    const result = await testImapConnection(creds.imap);
    authLog.info(`Connection test (imap): ${result.success ? "success" : "fail"}`);
    return result;
  }

  if (creds.providerType === "gmail" && creds.gmail?.accessToken) {
    const email = await fetchGmailProfileEmail(creds.gmail.accessToken);
    const success = !!email;
    authLog.info(`Connection test (gmail): ${success ? "success" : "fail"}`);
    return {
      success,
      error: email ? undefined : "Failed to fetch Gmail profile",
    };
  }

  if (creds.providerType === "microsoft" && creds.microsoft?.accessToken) {
    try {
      const resp = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=mail",
        { headers: { Authorization: `Bearer ${creds.microsoft.accessToken}` } }
      );
      const success = resp.ok;
      authLog.info(`Connection test (microsoft): ${success ? "success" : "fail"}`);
      return { success, error: success ? undefined : "Failed to reach Microsoft Graph" };
    } catch {
      authLog.warn("Connection test (microsoft): failed");
      return { success: false, error: "Failed to reach Microsoft Graph" };
    }
  }

  return { success: false, error: "Unknown provider" };
}

export function getAccountInfo(): AccountInfo {
  const creds = loadCredentials();
  const stats = getDashboardStats();
  const syncState = getSyncState();

  return {
    email: getSetting("accountEmail") || "",
    providerType: creds?.providerType || "none",
    registeredAt: parseInt(getSetting("registeredAt") || "0", 10) || undefined,
    lastSyncAt: syncState.last_sync_at,
    totalMessages: stats.totalMessages,
  };
}

export async function getEmailConnection(): Promise<EmailConnection | null> {
  if (!hasCredentials()) return null;

  const provider = getProvider();
  try {
    const connection = await provider.connect();
    await provider.disconnect();
    return connection;
  } catch {
    return null;
  }
}

export async function requestModifyAccess() {
  authLog.warn("Modify access requested");
  const creds = loadCredentials();
  if (!creds) return { success: false, error: "No credentials stored" };

  if (creds.providerType === "imap" || creds.providerType === "microsoft") {
    return { success: true };
  }

  if (creds.providerType === "gmail") {
    return startLoopbackAuth(true);
  }

  return { success: false, error: "Unknown provider" };
}

export async function trashMessage(messageId: string) {
  const provider = getProvider();
  try {
    await provider.connect();
    await provider.trashMessage(messageId);
  } finally {
    await provider.disconnect();
  }
}

export async function markMessageAsSpam(messageId: string) {
  const provider = getProvider();
  try {
    await provider.connect();
    await provider.markAsSpam(messageId);
  } finally {
    await provider.disconnect();
  }
}

export async function markMessageAsRead(messageId: string, isRead: boolean) {
  const provider = getProvider();
  try {
    await provider.connect();
    await provider.markAsRead(messageId, isRead);
  } finally {
    await provider.disconnect();
  }
}

type BulkActionType = "trashed" | "spam_reported";

async function bulkActionVendorMessages(
  vendorId: number,
  actionType: BulkActionType,
): Promise<{ success: boolean; error?: string }> {
  const label = actionType === "trashed" ? "trashVendorMessages" : "spamVendorMessages";
  const permissionVerb = actionType === "trashed" ? "move emails to trash" : "report spam";

  const ids = getMessageIdsByVendor(vendorId, "bulk");
  actionLog.info(`${label}: found ${ids.length} bulk messages for vendor ${vendorId}`);

  if (ids.length > 0) {
    const provider = getProvider();
    let canModify: boolean;
    try {
      const connection = await provider.connect();
      canModify = connection.canModify;
      await provider.disconnect();
    } catch (err) {
      actionLog.error(`${label}: connection failed (vendor ${vendorId}): ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: "Failed to connect to your email account." };
    }

    if (!canModify) {
      actionLog.warn(`${label}: provider lacks modify access (vendor ${vendorId})`);
      return { success: false, error: `Your account doesn't have permission to ${permissionVerb}. Reconnect your account in Settings to grant full access.` };
    }

    const p = getProvider();
    (async () => {
      try {
        await p.connect();
        actionLog.info(`${label}: processing ${ids.length} messages for vendor ${vendorId}`);
        for (const id of ids) {
          try {
            if (actionType === "trashed") {
              await p.trashMessage(id);
            } else {
              await p.markAsSpam(id);
            }
          } catch (err) {
            actionLog.error(`${label}: failed on message ${id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        const { count, sizeBytes } = deleteVendorBulkMessages(vendorId);
        if (count > 0) insertActionLog(vendorId, actionType, count, sizeBytes);
        actionLog.info(`${label}: done for vendor ${vendorId}`);
      } catch (err) {
        actionLog.error(`${label}: error (vendor ${vendorId}): ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await p.disconnect();
      }
    })().catch((err) => {
      actionLog.error(`${label}: unexpected error (vendor ${vendorId}): ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  return { success: true };
}

export async function trashVendorMessages(vendorId: number): Promise<{ success: boolean; error?: string }> {
  return bulkActionVendorMessages(vendorId, "trashed");
}

export async function spamVendorMessages(vendorId: number): Promise<{ success: boolean; error?: string }> {
  return bulkActionVendorMessages(vendorId, "spam_reported");
}
