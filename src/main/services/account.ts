import { getElectron } from "../electronRuntime";
import { SecureStorageError } from "../secureStorage";
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
import { addWhitelistEntry, getSetting, saveSetting, applyAutoLaunch, requirePro } from "./settings";
import { saveGlobalSetting } from "./globalSettings";
import { getDashboardStats } from "./stats";
import { getSyncState } from "./sync";
import {
  getMessageIdsByVendor,
  deleteVendorMessages,
  insertActionLog,
} from "./messages";
import { updateVendorFlags, updateVendorStats } from "./vendors";
import { createAccountDb, getDb, reconnectDb } from "../db";
import { IPC } from "@shared/ipc";
import { PERSONAL_DOMAINS } from "@paperweight/analysis/contracts";
import type { AccountAuthIntent, ImapConfig, AccountInfo, EmailConnection, MessageType, ServerConfig } from "@shared/types";
import { MARKETING_ACTION_TYPES } from "@shared/types";
import { authLog, actionLog } from "../utils/log";
import { seedProfileEmailsFromCurrentAccount } from "./profileSeed";
import { validateAccountIntent } from "./accountIntent";

async function requireAccountEntitlement(intent: AccountAuthIntent): Promise<void> {
  if (intent.type === "add" && listAccounts().length > 0) await requirePro();
}

// Populate per-account settings in the DB if they are missing.
// Called after every DB reconnect (account switch or new account setup).
export function ensureAccountSettingsInDb(): void {
  const activeEmail = getActiveEmail();
  if (!activeEmail) return;

  if (!getSetting("accountEmail")) {
    saveSetting("accountEmail", activeEmail);
    addWhitelistEntry(activeEmail.toLowerCase());
    const domain = activeEmail.split("@")[1];
    if (domain && !PERSONAL_DOMAINS.includes(domain.toLowerCase())) {
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
  const { app, BrowserWindow } = getElectron();
  const newDbPath = join(app.getPath("userData"), `${emailToFileKey(email)}.db`);
  createAccountDb(newDbPath);
  reconnectDb(newDbPath);
  ensureAccountSettingsInDb();
  seedProfileEmailsFromCurrentAccount(getDb(), email);
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

export async function startGmailAuthAndRecordAccount(
  intent: AccountAuthIntent,
  openInBrowser = true,
) {
  try {
    await requireAccountEntitlement(intent);
    authLog.info("Gmail auth started");
    setStagingMode(true);
    let result;
    try {
      result = await startLoopbackAuth(openInBrowser);
    } finally {
      setStagingMode(false);
    }

    if (!result.success) {
      authLog.error("Gmail auth failed:", result.error);
      return result;
    }

    const stagingCreds = await loadCredentials("__staging__");
    if (!stagingCreds?.gmail?.accessToken) {
      return { success: false, error: "Auth failed: no credentials stored" };
    }

    const email = await fetchGmailProfileEmail(stagingCreds.gmail.accessToken);
    if (!email) {
      return { success: false, error: "Auth failed: could not fetch account email" };
    }

    const intentResult = validateAccountIntent(
      intent,
      email,
      "gmail",
      listAccounts(),
      getActiveEmail(),
    );
    if (!intentResult.success) return intentResult;

    authLog.info("Gmail auth completed");
    await requireAccountEntitlement(intent);
    await saveCredentials(stagingCreds, email);
    if (intent.type === "add") recordAccount(email, "gmail");

    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not connect this account." };
  } finally {
    deleteCredentials("__staging__");
  }
}

export async function startMicrosoftAuthAndRecordAccount(
  intent: AccountAuthIntent,
  openInBrowser = true,
) {
  try {
    await requireAccountEntitlement(intent);
    authLog.info("Microsoft auth started");
    setStagingMode(true);
    let result;
    try {
      result = await startMicrosoftLoopbackAuth(openInBrowser);
    } finally {
      setStagingMode(false);
    }

    if (!result.success) {
      authLog.error("Microsoft auth failed:", result.error);
      return result;
    }

    const stagingCreds = await loadCredentials("__staging__");
    if (!stagingCreds?.microsoft?.accessToken) {
      return { success: false, error: "Auth failed: no credentials stored" };
    }

    const email = await fetchMicrosoftProfileEmail(stagingCreds.microsoft.accessToken);
    if (!email) {
      return { success: false, error: "Auth failed: could not fetch account email" };
    }

    const intentResult = validateAccountIntent(
      intent,
      email,
      "microsoft",
      listAccounts(),
      getActiveEmail(),
    );
    if (!intentResult.success) return intentResult;

    authLog.info("Microsoft auth completed");
    await requireAccountEntitlement(intent);
    await saveCredentials(stagingCreds, email);
    if (intent.type === "add") recordAccount(email, "microsoft");

    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not connect this account." };
  } finally {
    deleteCredentials("__staging__");
  }
}

export async function saveImapConfigAndRecordAccount(
  intent: AccountAuthIntent,
  config: ImapConfig,
) {
  try {
    await requireAccountEntitlement(intent);
    const intentResult = validateAccountIntent(
      intent,
      config.username,
      "imap",
      listAccounts(),
      getActiveEmail(),
    );
    if (!intentResult.success) return intentResult;

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
    await requireAccountEntitlement(intent);
    await saveCredentials({ providerType: "imap", imap: config }, email);
    if (intent.type === "add") recordAccount(email, "imap");

    return { success: true };
  } catch (err) {
    authLog.error("IMAP config save failed:", err instanceof Error ? err.message : String(err));
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateServerConfig(
  server: ServerConfig & { smtp: NonNullable<ServerConfig["smtp"]> },
): Promise<{ success: boolean; error?: string }> {
  const creds = await loadCredentials();
  if (!creds?.imap) {
    return { success: false, error: "No IMAP account to update" };
  }

  const imapCfg: ImapConfig = {
    host: server.imap.host,
    port: server.imap.port,
    tls: server.imap.tls,
    allowSelfSigned: server.imap.allowSelfSigned,
    username: creds.imap.username,
    password: creds.imap.password,
    smtp: server.smtp,
  };

  authLog.info(
    `Update server config: IMAP ${server.imap.host}:${server.imap.port} + SMTP ${server.smtp.host}:${server.smtp.port}`,
  );
  const [imapResult, smtpResult] = await Promise.all([
    testImapConnection(imapCfg),
    testSmtpConnection({
      host: server.smtp.host,
      port: server.smtp.port,
      tls: server.smtp.tls,
      username: creds.imap.username,
      password: creds.imap.password,
      allowSelfSigned: server.imap.allowSelfSigned,
    }),
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
  if (!imapResult.success) return { success: false, error: `IMAP: ${imapResult.error}` };
  if (!smtpResult.success) return { success: false, error: `SMTP: ${smtpResult.error}` };

  await saveCredentials({ ...creds, imap: imapCfg });
  authLog.info("Server config updated");

  return { success: true };
}

export async function getAccountInfo(): Promise<AccountInfo> {
  let creds: Awaited<ReturnType<typeof loadCredentials>>;
  let storageError: string | undefined;
  try {
    creds = await loadCredentials(getActiveEmail());
    if (!creds) storageError = "Saved credentials are unavailable. Reconnect this account to resume syncing. Your indexed mail and settings are still here.";
  } catch (error) {
    if (!(error instanceof SecureStorageError)) throw error;
    storageError = error.message;
  }
  const stats = getDashboardStats();
  const syncState = getSyncState();

  const server = creds?.imap
    ? {
        imap: {
          host: creds.imap.host,
          port: creds.imap.port,
          tls: creds.imap.tls,
          allowSelfSigned: creds.imap.allowSelfSigned ?? false,
        },
        smtp: creds.imap.smtp ? { ...creds.imap.smtp } : undefined,
      }
    : undefined;

  return {
    email: getSetting("accountEmail") || "",
    providerType: creds?.providerType ?? listAccounts().find((entry) => entry.email === getActiveEmail())?.providerType ?? "none",
    credentialsMissing: !hasCredentials(),
    storageError,
    registeredAt: parseInt(getSetting("registeredAt") || "0", 10) || undefined,
    lastSyncAt: syncState.last_sync_at,
    totalMessages: stats.totalMessages,
    server,
  };
}

export async function getEmailConnection(): Promise<EmailConnection | null> {
  if (!hasCredentials()) return null;

  try {
    const provider = await getProvider();
    const connection = await provider.connect();
    await provider.disconnect();
    return connection;
  } catch {
    return null;
  }
}

export async function trashMessage(messageId: string) {
  await requirePro();
  const provider = await getProvider();
  try {
    await provider.connect();
    await requirePro();
    await provider.trashMessage(messageId);
  } finally {
    await provider.disconnect();
  }
}

export async function markMessageAsSpam(messageId: string) {
  await requirePro();
  const provider = await getProvider();
  try {
    await provider.connect();
    await requirePro();
    await provider.markAsSpam(messageId);
  } finally {
    await provider.disconnect();
  }
}

export async function markMessageAsRead(messageId: string, isRead: boolean) {
  await requirePro();
  const provider = await getProvider();
  try {
    await provider.connect();
    await requirePro();
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
  await requirePro();
  const label = actionType === "trashed" ? "trashVendorMessages" : "spamVendorMessages";

  const ids = getMessageIdsByVendor(vendorId, types);
  actionLog.info(`${label}: found ${ids.length} messages for vendor ${vendorId}`);

  if (ids.length > 0) {
    const run = async (): Promise<{ success: boolean; error?: string }> => {
      const p = await getProvider();
      try {
        await p.connect();
        actionLog.info(`${label}: processing ${ids.length} messages for vendor ${vendorId}`);
        let failed = false;
        for (const id of ids) {
          try {
            await requirePro();
            if (actionType === "trashed") {
              await p.trashMessage(id);
            } else {
              await p.markAsSpam(id);
            }
          } catch (err) {
            failed = true;
            actionLog.error(`${label}: failed on message ${id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (failed) {
          return {
            success: false,
            error: "One or more mailbox operations failed. Local records were kept.",
          };
        }
        const { count } = deleteVendorMessages(vendorId, types);
        updateVendorStats(vendorId);
        updateVendorFlags(vendorId);
        if (count > 0) insertActionLog(vendorId, actionType, count, 0);
        actionLog.info(`${label}: done for vendor ${vendorId}`);
        return { success: true };
      } catch (err) {
        actionLog.error(`${label}: error (vendor ${vendorId}): ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, error: "The mailbox operation failed. Local records were kept." };
      } finally {
        try {
          await p.disconnect();
        } catch (err) {
          actionLog.error(`${label}: disconnect failed (vendor ${vendorId}): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    return run();
  }

  return { success: true };
}

// types: undefined = all message types, otherwise filter to specified types
export async function trashVendorMessages(
  vendorId: number,
  types?: MessageType[],
): Promise<{ success: boolean; error?: string }> {
  return bulkActionVendorMessages(vendorId, "trashed", types);
}

export async function spamVendorMessages(
  vendorId: number,
): Promise<{ success: boolean; error?: string }> {
  return bulkActionVendorMessages(
    vendorId,
    "spam_reported",
    [...MARKETING_ACTION_TYPES],
  );
}
