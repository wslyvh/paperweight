import { app, BrowserWindow, ipcMain } from "electron";
import { readFileSync, statSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc";
import { isIntInRange, isString } from "@shared/validation";
import type { ImapConfig, SupportInfo, AccountSummary, MessageType } from "@shared/types";
import { isMessageType } from "@shared/types";
import {
  getAccountInfo,
  getConnectionStatus,
  getEmailConnection,
  saveImapConfigAndRecordAccount,
  startGmailAuthAndRecordAccount,
  startMicrosoftAuthAndRecordAccount,
  testCurrentConnection,
  trashMessage,
  markMessageAsSpam,
  markMessageAsRead,
  trashVendorMessages,
  spamVendorMessages,
  ensureAccountSettingsInDb,
} from "../services/account";
import { clearSyncData, getSyncState } from "../services/sync";
import { startSync, getSyncStatus, stopSync, stopAllSyncs } from "../sync-manager";
import { getLicenseStatus, deleteLicense } from "../services/settings";
import { getDashboardStats } from "../services/stats";
import {
  deleteCredentials,
  loadCredentials,
  listAccounts,
  getActiveEmail,
  setActiveEmail,
  removeAccountEntry,
  emailToFileKey,
} from "../credentials";
import { wipeDatabase, deleteDbFiles, reconnectDb } from "../db";
import { dataLog, actionLog } from "../utils/log";
import { getFileLogPath } from "../utils/file-log";
import os from "os";

function isImapConfig(value: unknown): value is ImapConfig {
  if (!value || typeof value !== "object") return false;
  const cfg = value as Record<string, unknown>;

  return (
    isString(cfg.host) &&
    cfg.host.trim() !== "" &&
    isIntInRange(cfg.port, 1, 65535) &&
    typeof cfg.tls === "boolean" &&
    isString(cfg.username) &&
    cfg.username.trim() !== "" &&
    isString(cfg.password) &&
    cfg.password.trim() !== ""
  );
}

function getDbSizeMb(): number {
  try {
    const activeEmail = getActiveEmail();
    if (!activeEmail) return 0;
    const dbPath = join(app.getPath("userData"), `${emailToFileKey(activeEmail)}.db`);
    const stats = statSync(dbPath);
    return Math.round((stats.size / (1024 * 1024)) * 100) / 100;
  } catch {
    return 0;
  }
}

export function registerAccountHandlers(): void {
  // --- Auth & connection ---

  ipcMain.handle(IPC.getConnectionStatus, () => getConnectionStatus());

  ipcMain.handle(IPC.startGmailAuth, () => startGmailAuthAndRecordAccount());

  ipcMain.handle(IPC.startMicrosoftAuth, () => startMicrosoftAuthAndRecordAccount());

  ipcMain.handle(IPC.saveImapConfig, (_event, config: unknown) => {
    if (!isImapConfig(config)) throw new Error("Invalid IMAP config");
    return saveImapConfigAndRecordAccount(config);
  });

  ipcMain.handle(IPC.testConnection, () => testCurrentConnection());

  ipcMain.handle(IPC.getAccountInfo, () => getAccountInfo());

  ipcMain.handle(IPC.getEmailConnection, () => getEmailConnection());

  // --- Multi-account management ---

  // Pre-flight license check before the renderer starts an OAuth flow.
  // Intentionally two-step: this returns immediately so the renderer can show
  // the license modal inline, then the actual auth IPC (startGmailAuth etc.)
  // is called separately once the user is cleared to proceed.
  ipcMain.handle(IPC.addAccount, () => {
    const existing = listAccounts();
    if (existing.length >= 1) {
      const license = getLicenseStatus();
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
    }));
  });

  ipcMain.handle(IPC.switchAccount, (_event, email: unknown) => {
    if (!isString(email) || !email.trim()) throw new Error("Invalid email");
    if (!listAccounts().some((a) => a.email === email)) throw new Error("Account not found");
    if (email === getActiveEmail()) return;

    setActiveEmail(email as string);

    const newDbPath = join(app.getPath("userData"), `${emailToFileKey(email as string)}.db`);
    reconnectDb(newDbPath);
    ensureAccountSettingsInDb();

    // Ensure the newly active account is syncing (no-op if already running)
    startSync(email as string);

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.accountSwitched, email);
    }
  });

  ipcMain.handle(IPC.removeAccount, (_event, email: unknown) => {
    if (!isString(email) || !email.trim()) throw new Error("Invalid email");
    if (!listAccounts().some((a) => a.email === email)) throw new Error("Account not found");
    const activeEmail = getActiveEmail();
    const isActive = email === activeEmail;

    // Stop this account's sync worker regardless of whether it's active
    stopSync(email);

    // Delete the account's credential file
    deleteCredentials(email);

    // Delete the account's database
    if (isActive) {
      // The active account's DB connection is open — must close it before deleting
      // (on Windows, unlinkSync on an open file fails silently)
      wipeDatabase();
    } else {
      deleteDbFiles(email);
    }

    removeAccountEntry(email); // also updates activeAccount in settings.json to next account

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

  ipcMain.handle(IPC.trashMessage, (_event, messageId: unknown) => {
    if (!isString(messageId)) throw new Error("Invalid message ID");
    return trashMessage(messageId);
  });

  ipcMain.handle(IPC.markMessageAsSpam, (_event, messageId: unknown) => {
    if (!isString(messageId)) throw new Error("Invalid message ID");
    return markMessageAsSpam(messageId);
  });

  ipcMain.handle(
    IPC.markMessageAsRead,
    (_event, messageId: unknown, isRead: unknown) => {
      if (!isString(messageId)) throw new Error("Invalid message ID");
      if (typeof isRead !== "boolean") throw new Error("Invalid isRead flag");
      return markMessageAsRead(messageId, isRead);
    }
  );

  ipcMain.handle(IPC.trashVendorMessages, (_event, vendorId: unknown, types: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    if (types !== undefined && (!Array.isArray(types) || !types.every(isMessageType))) throw new Error("Invalid types");
    const narrowedTypes = Array.isArray(types) ? (types as MessageType[]) : undefined;
    actionLog.info(`Trash vendor messages: vendor ${vendorId}, types=${types ?? "all"}`);
    return trashVendorMessages(vendorId, narrowedTypes);
  });

  ipcMain.handle(IPC.reportSpamVendor, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    actionLog.info(`Report spam vendor: vendor ${vendorId}`);
    return spamVendorMessages(vendorId);
  });

  // --- Sync ---

  ipcMain.handle(IPC.startSync, () => {
    startSync();
  });

  ipcMain.handle(IPC.getSyncStatus, () => getSyncStatus());

  ipcMain.handle(IPC.resyncData, () => {
    dataLog.warn("Re-sync data requested");
    stopSync(); // stops active account's worker
    clearSyncData();
  });

  ipcMain.handle(IPC.wipeData, () => {
    dataLog.warn("Wipe ALL data requested");
    const accounts = listAccounts();
    const userData = app.getPath("userData");

    stopAllSyncs();

    // Close the active DB connection before deleting (Windows file lock)
    wipeDatabase();

    // Delete every account's database and credentials.
    // The active account's DB files are already gone via wipeDatabase() above.
    const activeEmail = getActiveEmail();
    for (const acc of accounts) {
      deleteCredentials(acc.email);
      if (acc.email !== activeEmail) deleteDbFiles(acc.email);
    }

    // Delete staging credentials (written during OAuth before email is known)
    deleteCredentials("__staging__");

    // Delete the accounts registry and global settings
    for (const file of ["accounts.json", "settings.json"]) {
      const filePath = join(userData, file);
      try {
        if (existsSync(filePath)) unlinkSync(filePath);
      } catch {
        // Non-fatal
      }
    }

    deleteLicense();

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.noAccountsRemaining);
    }
  });

  // --- Support / diagnostics ---

  ipcMain.handle(IPC.getSupportInfo, (): SupportInfo => {
    const creds = loadCredentials();
    const license = getLicenseStatus();
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
      providerType: creds?.providerType || "none",
      licenseActive: license.active,
      totalMessages: stats.totalMessages,
      lastSyncAt: syncState.last_sync_at,
      dbSizeMb: getDbSizeMb(),
      logPath: getFileLogPath() || join(app.getPath("logs"), "main.log"),
    };
  });

  ipcMain.handle(IPC.readLogFile, () => {
    const logPath = getFileLogPath() || join(app.getPath("logs"), "main.log");
    try {
      return readFileSync(logPath, "utf-8");
    } catch {
      return "";
    }
  });
}
