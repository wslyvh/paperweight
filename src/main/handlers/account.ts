import { handle } from "./access";
import { switchToAccount } from "../services/accountView";
import { app, BrowserWindow, ipcMain } from "electron";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc";
import { isIntInRange, isString } from "@shared/validation";
import type { ImapConfig, ServerConfig, SupportInfo, MessageType } from "@shared/types";
import { isAccountAuthIntent, isMessageType } from "@shared/types";
import {
  getAccountInfo,
  getConnectionStatus,
  getEmailConnection,
  saveImapConfigAndRecordAccount,
  startGmailAuthAndRecordAccount,
  startMicrosoftAuthAndRecordAccount,
  updateServerConfig,
  trashMessage,
  markMessageAsSpam,
  markMessageAsRead,
  trashVendorMessages,
  spamVendorMessages,
  ensureAccountSettingsInDb,
} from "../services/account";
import { clearSyncData, getSyncState } from "../services/sync";
import { getStorageBreakdown, accountDbBytes } from "../services/storage";
import { sendEmail } from "../services/email";
import {
  getSyncStatus,
  startAllSyncs,
  stopSync,
} from "../sync-manager";
import { getLicenseStatus } from "../services/settings";
import { getDashboardStats } from "../services/stats";
import {
  deleteCredentials,
  listAccounts,
  getActiveEmail,
  removeAccountEntry,
  emailToFileKey,
} from "../credentials";
import { wipeDatabase, deleteDbFiles, reconnectDb } from "../db";
import { requestFactoryReset } from "../services/factoryReset";
import { dataLog, actionLog } from "../utils/log";
import { getFileLogPath } from "../utils/file-log";
import os from "os";

type ServerConfigInput = ServerConfig & { smtp: NonNullable<ServerConfig["smtp"]> };

function isServerConfigInput(value: unknown): value is ServerConfigInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!v.imap || typeof v.imap !== "object") return false;
  if (!v.smtp || typeof v.smtp !== "object") return false;

  const imap = v.imap as Record<string, unknown>;
  const smtp = v.smtp as Record<string, unknown>;

  return (
    isString(imap.host) &&
    imap.host.trim() !== "" &&
    isIntInRange(imap.port, 1, 65535) &&
    typeof imap.tls === "boolean" &&
    typeof imap.allowSelfSigned === "boolean" &&
    isString(smtp.host) &&
    smtp.host.trim() !== "" &&
    isIntInRange(smtp.port, 1, 65535) &&
    typeof smtp.tls === "boolean"
  );
}

function isImapConfig(value: unknown): value is ImapConfig {
  if (!value || typeof value !== "object") return false;
  const cfg = value as Record<string, unknown>;

  const baseValid =
    isString(cfg.host) &&
    cfg.host.trim() !== "" &&
    isIntInRange(cfg.port, 1, 65535) &&
    typeof cfg.tls === "boolean" &&
    isString(cfg.username) &&
    cfg.username.trim() !== "" &&
    isString(cfg.password) &&
    cfg.password.trim() !== "";

  if (!baseValid) return false;

  if (cfg.smtp !== undefined) {
    if (!cfg.smtp || typeof cfg.smtp !== "object") return false;
    const smtp = cfg.smtp as Record<string, unknown>;
    if (
      !isString(smtp.host) ||
      smtp.host.trim() === "" ||
      !isIntInRange(smtp.port, 1, 65535) ||
      typeof smtp.tls !== "boolean"
    ) {
      return false;
    }
  }

  return true;
}


export function registerAccountHandlers(): void {
  // --- Auth & connection ---

  handle(IPC.getConnectionStatus, () => getConnectionStatus());

  // openInBrowser defaults to true; the onboarding "copy link" path passes false
  // so the auth URL is copied to the clipboard instead of auto-opened.
  handle(IPC.startGmailAuth, (_event, intent: unknown, openInBrowser: unknown) => {
    if (!isAccountAuthIntent(intent)) throw new Error("Invalid account auth intent");
    return startGmailAuthAndRecordAccount(intent, openInBrowser !== false);
  });

  handle(IPC.startMicrosoftAuth, (_event, intent: unknown, openInBrowser: unknown) => {
    if (!isAccountAuthIntent(intent)) throw new Error("Invalid account auth intent");
    return startMicrosoftAuthAndRecordAccount(intent, openInBrowser !== false);
  });

  handle(IPC.saveImapConfig, (_event, intent: unknown, config: unknown) => {
    if (!isAccountAuthIntent(intent)) throw new Error("Invalid account auth intent");
    if (!isImapConfig(config)) throw new Error("Invalid IMAP config");
    return saveImapConfigAndRecordAccount(intent, config);
  });

  handle(IPC.updateServerConfig, (_event, server: unknown) => {
    if (!isServerConfigInput(server)) throw new Error("Invalid server config");
    return updateServerConfig(server);
  });

  handle(IPC.getAccountInfo, () => getAccountInfo());

  handle(IPC.getEmailConnection, () => getEmailConnection());

  // --- Multi-account management ---

  // Pre-flight license check before the renderer starts an OAuth flow.
  // Intentionally two-step: this returns immediately so the renderer can show
  // the license modal inline, then the actual auth IPC (startGmailAuth etc.)
  // is called separately once the user is cleared to proceed.
  handle(IPC.addAccount, async () => {
    const existing = listAccounts();
    if (existing.length >= 1) {
      const license = await getLicenseStatus();
      if (!license.active) {
        return { blocked: true, reason: "license_required" };
      }
    }
    return null;
  });

  ipcMain.on(IPC.listAccounts, (event) => {
    const activeEmail = getActiveEmail();
    event.returnValue = listAccounts().map((a) => ({
      email: a.email,
      providerType: a.providerType,
      registeredAt: a.registeredAt,
      isActive: a.email === activeEmail,
      sizeBytes: accountDbBytes(a.email),
    }));
  });

  handle(IPC.switchAccount, (_event, email: unknown) => {
    if (!isString(email) || !email.trim()) throw new Error("Invalid email");
    if (!listAccounts().some((a) => a.email === email)) throw new Error("Account not found");
    if (email === getActiveEmail()) return;

    // Open the next database before changing the sync account. switchToAccount
    // restores the previous connection if opening fails and notifies the renderer.
    switchToAccount(email);
    ensureAccountSettingsInDb();

    startAllSyncs();
  });

  handle(IPC.removeAccount, async (_event, email: unknown) => {
    if (!isString(email) || !email.trim()) throw new Error("Invalid email");
    if (!listAccounts().some((a) => a.email === email)) throw new Error("Account not found");
    const activeEmail = getActiveEmail();
    const isActive = email === activeEmail;
    const accountDbPath = join(
      app.getPath("userData"),
      `${emailToFileKey(email)}.db`,
    );

    // Stop this account's sync worker regardless of whether it's active
    await stopSync(email);

    try {
      // Delete the database first. If a file lock prevents deletion, retain the
      // credential and registry entry so the user can retry.
      if (isActive) {
        wipeDatabase();
      } else {
        deleteDbFiles(email);
      }
      deleteCredentials(email);
    } catch {
      // wipeDatabase closes the active connection before unlinking. Reconnect
      // when the database itself survived so the failed operation is retryable.
      if (isActive && existsSync(accountDbPath)) {
        try {
          reconnectDb(accountDbPath);
          if (isActive) ensureAccountSettingsInDb();
        } catch {
          // The fixed error below is authoritative and carries no personal path.
        }
      }
      throw new Error("Could not delete this account's local data. Try again.");
    }

    try {
      removeAccountEntry(email); // also updates activeAccount in global.db
    } catch {
      throw new Error("Could not update the account registry. Try again.");
    }

    if (isActive) {
      const remaining = listAccounts();
      if (remaining.length > 0) {
        const nextEmail = getActiveEmail()!; // set by removeAccountEntry
        const newDbPath = join(app.getPath("userData"), `${emailToFileKey(nextEmail)}.db`);
        reconnectDb(newDbPath);
        ensureAccountSettingsInDb();
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.accountSwitched, nextEmail);
        }
      }
      if (remaining.length === 0) {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.noAccountsRemaining);
        }
      }
    }
  });

  // --- Email actions ---

  handle(IPC.trashMessage, (_event, messageId: unknown) => {
    if (!isString(messageId)) throw new Error("Invalid message ID");
    return trashMessage(messageId);
  });

  handle(IPC.markMessageAsSpam, (_event, messageId: unknown) => {
    if (!isString(messageId)) throw new Error("Invalid message ID");
    return markMessageAsSpam(messageId);
  });

  handle(
    IPC.markMessageAsRead,
    (_event, messageId: unknown, isRead: unknown) => {
      if (!isString(messageId)) throw new Error("Invalid message ID");
      if (typeof isRead !== "boolean") throw new Error("Invalid isRead flag");
      return markMessageAsRead(messageId, isRead);
    }
  );

  handle(IPC.trashVendorMessages, (_event, vendorId: unknown, types: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    if (types !== undefined && (!Array.isArray(types) || !types.every(isMessageType))) throw new Error("Invalid types");
    const narrowedTypes = Array.isArray(types) ? (types as MessageType[]) : undefined;
    actionLog.info(`Trash vendor messages: vendor ${vendorId}, types=${types ?? "all"}`);
    return trashVendorMessages(vendorId, narrowedTypes);
  });

  handle(IPC.reportSpamVendor, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    actionLog.info(`Report spam vendor: vendor ${vendorId}`);
    return spamVendorMessages(vendorId);
  });

  // --- Sync ---

  handle(IPC.startSync, () => startAllSyncs());

  handle(IPC.getSyncStatus, () => getSyncStatus(getActiveEmail()));

  handle(IPC.resyncData, async () => {
    dataLog.warn("Re-sync data requested");
    await stopSync(); // stops active account's worker
    clearSyncData();
  });

  handle(IPC.wipeData, async () => {
    await requestFactoryReset();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.noAccountsRemaining);
    }
  });

  // --- Support / diagnostics ---

  handle(IPC.getSupportInfo, async (): Promise<SupportInfo> => {
    const account = listAccounts().find((entry) => entry.email === getActiveEmail());
    const license = await getLicenseStatus();
    const stats = getDashboardStats();
    const syncState = getSyncState();

    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      platform: process.platform,
      providerType: account?.providerType || "none",
      licenseActive: license.active,
      totalMessages: stats.totalMessages,
      lastSyncAt: syncState.last_sync_at,
      logPath: getFileLogPath() || join(app.getPath("logs"), "main.log"),
    };
  });

  handle(IPC.getStorageBreakdown, () => getStorageBreakdown());

  handle(
    IPC.sendEmail,
    async (_event, to: unknown, subject: unknown, body: unknown, inReplyTo?: unknown) => {
      if (!isString(to) || !to.includes("@")) throw new Error("Invalid recipient");
      if (!isString(subject)) throw new Error("Invalid subject");
      if (!isString(body)) throw new Error("Invalid body");
      if (inReplyTo !== undefined && !isString(inReplyTo)) throw new Error("Invalid inReplyTo");
      return sendEmail(to, subject, body, inReplyTo);
    },
  );

  handle(IPC.readLogFile, () => {
    const logPath = getFileLogPath() || join(app.getPath("logs"), "main.log");
    try {
      return readFileSync(logPath, "utf-8");
    } catch {
      return "";
    }
  });
}
