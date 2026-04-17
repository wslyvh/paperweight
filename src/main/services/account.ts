import { join } from "path";
import {
  loadCredentials,
  saveCredentials,
  deleteCredentials,
  hasCredentials,
  setStagingMode,
  registerAccount,
  listAccounts,
  getActiveEmail,
  emailToFileKey,
  accountTag,
} from "../credentials";
import { startLoopbackAuth, fetchGmailProfileEmail } from "../providers/gmail";
import { startMicrosoftLoopbackAuth, fetchMicrosoftProfileEmail } from "../providers/microsoft";
import { testImapConnection } from "../providers/imap";
import { testSmtpConnection } from "../providers/smtp";
import { getProvider } from "../providers/ProviderFactory";
import { addWhitelistEntry, getSetting, saveSetting, applyAutoLaunch } from "./settings";
import { saveGlobalSetting } from "./globalSettings";
import { getDashboardStats } from "./stats";
import { getSyncState } from "./sync";
import {
  getMessageIdsByVendor,
  deleteVendorMessages,
  insertActionLog,
} from "./messages";
import { createAccountDb, reconnectDb } from "../db";
import { IPC } from "@shared/ipc";
import { APP_CONFIG } from "@shared/config";
import type { ImapConfig, AccountInfo, EmailConnection, MessageType } from "@shared/types";
import { authLog, actionLog } from "../utils/log";

// Populate per-account settings in the DB if they are missing.
// Called after every DB reconnect (account switch or new account setup).
export function ensureAccountSettingsInDb(): void {
  const activeEmail = getActiveEmail();
  if (!activeEmail) return;

  if (!getSetting("accountEmail")) {
    saveSetting("accountEmail", activeEmail);
    addWhitelistEntry(activeEmail.toLowerCase());
    const domain = activeEmail.split("@")[1];
    if (domain && !APP_CONFIG.PERSONAL_DOMAINS.includes(domain.toLowerCase())) {
      addWhitelistEntry(domain);
    }
  }

  if (!getSetting("registeredAt")) {
    const account = listAccounts().find((a) => a.email === activeEmail);
    if (account?.registeredAt) {
      saveSetting("registeredAt", String(account.registeredAt));
    }
  }
}

// Create a fresh DB for a new account, switch to it, and notify the renderer.
function switchToNewAccount(email: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app, BrowserWindow } = require("electron") as typeof import("electron");
  const newDbPath = join(app.getPath("userData"), `${emailToFileKey(email)}.db`);
  createAccountDb(newDbPath);
  reconnectDb(newDbPath);
  ensureAccountSettingsInDb();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.accountSwitched, email);
  }
}


// Register an account and set up its DB if new. Called after credentials are saved.
function recordAccount(email: string, providerType: string): void {
  const existingAccounts = listAccounts();
  const isFirstAccount = existingAccounts.length === 0;
  const isNewAccount = !existingAccounts.find((a) => a.email === email);

  const now = Date.now();
  const registeredAt = isNewAccount ? now : (parseInt(getSetting("registeredAt") || "0", 10) || now);

  registerAccount(email, providerType, registeredAt);

  if (isNewAccount) {
    authLog.info(isFirstAccount ? `First account [${accountTag(email)}] registered` : `New account [${accountTag(email)}] added`);
    switchToNewAccount(email);
    saveSetting("registeredAt", String(registeredAt));
    if (isFirstAccount) {
      saveGlobalSetting("autoLaunch", true);
      saveGlobalSetting("launchMinimized", true);
      applyAutoLaunch(true, true);
    }
  }
}

export function getConnectionStatus() {
  return hasCredentials();
}

export async function startGmailAuthAndRecordAccount() {
  authLog.info("Gmail auth started");

  setStagingMode(true);
  const result = await startLoopbackAuth();
  setStagingMode(false);

  if (!result.success) {
    deleteCredentials("__staging__");
    authLog.error("Gmail auth failed:", result.error);
    return result;
  }

  const stagingCreds = loadCredentials("__staging__");
  if (!stagingCreds?.gmail?.accessToken) {
    deleteCredentials("__staging__");
    return { success: false, error: "Auth failed: no credentials stored" };
  }

  const email = await fetchGmailProfileEmail(stagingCreds.gmail.accessToken);
  if (!email) {
    deleteCredentials("__staging__");
    return { success: false, error: "Auth failed: could not fetch account email" };
  }

  authLog.info("Gmail auth completed");
  saveCredentials(stagingCreds, email);
  deleteCredentials("__staging__");
  recordAccount(email, "gmail");

  return result;
}

export async function startMicrosoftAuthAndRecordAccount() {
  authLog.info("Microsoft auth started");

  setStagingMode(true);
  const result = await startMicrosoftLoopbackAuth();
  setStagingMode(false);

  if (!result.success) {
    deleteCredentials("__staging__");
    authLog.error("Microsoft auth failed:", result.error);
    return result;
  }

  const stagingCreds = loadCredentials("__staging__");
  if (!stagingCreds?.microsoft?.accessToken) {
    deleteCredentials("__staging__");
    return { success: false, error: "Auth failed: no credentials stored" };
  }

  const email = await fetchMicrosoftProfileEmail(stagingCreds.microsoft.accessToken);
  if (!email) {
    deleteCredentials("__staging__");
    return { success: false, error: "Auth failed: could not fetch account email" };
  }

  authLog.info("Microsoft auth completed");
  saveCredentials(stagingCreds, email);
  deleteCredentials("__staging__");
  recordAccount(email, "microsoft");

  return result;
}

export async function saveImapConfigAndRecordAccount(config: ImapConfig) {
  try {
    authLog.info(
      `Testing IMAP ${config.host}:${config.port} + SMTP ${config.smtp ? `${config.smtp.host}:${config.smtp.port}` : "(not provided)"}`,
    );
    const [imapResult, smtpResult] = await Promise.all([
      testImapConnection(config),
      config.smtp
        ? testSmtpConnection({
            host: config.smtp.host,
            port: config.smtp.port,
            tls: config.smtp.tls,
            username: config.username,
            password: config.password,
            allowSelfSigned: config.allowSelfSigned,
          })
        : Promise.resolve({ success: true as const }),
    ]);
    authLog.info(
      `Test results — IMAP: ${imapResult.success ? "ok" : `fail (${imapResult.error})`}, SMTP: ${smtpResult.success ? "ok" : `fail (${smtpResult.error})`}`,
    );

    if (!imapResult.success && !smtpResult.success) {
      return {
        success: false,
        error: `IMAP: ${imapResult.error}\nSMTP: ${smtpResult.error}`,
      };
    }
    if (!imapResult.success) {
      return { success: false, error: `IMAP: ${imapResult.error}` };
    }
    if (!smtpResult.success) {
      return { success: false, error: `SMTP: ${smtpResult.error}` };
    }

    const email = config.username;
    authLog.info("IMAP+SMTP config saved");
    saveCredentials({ providerType: "imap", imap: config }, email);
    recordAccount(email, "imap");

    return { success: true };
  } catch (err) {
    authLog.error("IMAP config save failed:", err instanceof Error ? err.message : String(err));
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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
  types?: MessageType[],
): Promise<{ success: boolean; error?: string }> {
  const label = actionType === "trashed" ? "trashVendorMessages" : "spamVendorMessages";

  const ids = getMessageIdsByVendor(vendorId, types);
  actionLog.info(`${label}: found ${ids.length} messages for vendor ${vendorId}`);

  if (ids.length > 0) {
    const provider = getProvider();
    try {
      await provider.connect();
      await provider.disconnect();
    } catch (err) {
      actionLog.error(`${label}: connection failed (vendor ${vendorId}): ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, error: "Failed to connect to your email account." };
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
        const { count, sizeBytes } = deleteVendorMessages(vendorId, types);
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

// types: undefined = all message types, otherwise filter to specified types
export async function trashVendorMessages(vendorId: number, types?: MessageType[]): Promise<{ success: boolean; error?: string }> {
  return bulkActionVendorMessages(vendorId, "trashed", types);
}

export async function spamVendorMessages(vendorId: number): Promise<{ success: boolean; error?: string }> {
  return bulkActionVendorMessages(vendorId, "spam_reported", ["bulk"]);
}
