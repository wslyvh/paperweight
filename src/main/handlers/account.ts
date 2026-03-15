import { app, ipcMain } from "electron";
import { readFileSync, statSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc";
import { APP_CONFIG } from "@shared/config";
import { isIntInRange, isString } from "@shared/validation";
import type { ImapConfig, SupportInfo, AccountSummary } from "@shared/types";
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
} from "../services/account";
import { clearSyncData, getSyncState } from "../services/sync";
import { startSync, getSyncStatus } from "../sync-manager";
import { getLicenseStatus, deleteLicense } from "../services/settings";
import { getDashboardStats } from "../services/stats";
import {
  deleteCredentials,
  loadCredentials,
  listAccounts,
  getActiveEmail,
  setActiveEmail,
  removeAccountEntry,
  sanitizeEmail,
} from "../credentials";
import { wipeDatabase } from "../db";
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
    const dbName = activeEmail ? `${sanitizeEmail(activeEmail)}.db` : `${APP_CONFIG.DOMAIN}.db`;
    const dbPath = join(app.getPath("userData"), dbName);
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

  ipcMain.handle(IPC.listAccounts, (): AccountSummary[] => {
    const activeEmail = getActiveEmail();
    return listAccounts().map((a) => ({
      email: a.email,
      providerType: a.providerType,
      registeredAt: a.registeredAt,
      isActive: a.email === activeEmail,
    }));
  });

  ipcMain.handle(IPC.switchAccount, (_event, email: unknown) => {
    if (!isString(email) || !email.trim()) throw new Error("Invalid email");
    const accounts = listAccounts();
    if (!accounts.find((a) => a.email === email)) throw new Error("Account not found");
    setActiveEmail(email);
    setImmediate(() => { app.relaunch(); app.exit(0); });
  });

  ipcMain.handle(IPC.removeAccount, (_event, email: unknown) => {
    if (!isString(email) || !email.trim()) throw new Error("Invalid email");
    const activeEmail = getActiveEmail();
    const isActive = email === activeEmail;

    // Delete the account's credential file
    deleteCredentials(email);

    // Delete the account's database
    const userData = app.getPath("userData");
    const dbPath = join(userData, `${sanitizeEmail(email)}.db`);
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
      for (const suffix of ["-wal", "-shm"]) {
        const p = dbPath + suffix;
        if (existsSync(p)) unlinkSync(p);
      }
    } catch {
      // Non-fatal
    }

    removeAccountEntry(email);

    if (isActive) {
      const remaining = listAccounts();
      if (remaining.length > 0) {
        // Switch to next account
        setImmediate(() => { app.relaunch(); app.exit(0); });
      }
      // If no accounts remain, return normally — renderer navigates to onboarding
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

  ipcMain.handle(IPC.trashVendorMessages, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    actionLog.info(`Trash vendor messages: vendor ${vendorId}`);
    return trashVendorMessages(vendorId);
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

  ipcMain.handle(IPC.clearSyncData, () => {
    dataLog.warn("Clear sync data requested");
    clearSyncData();
  });

  ipcMain.handle(IPC.wipeData, () => {
    dataLog.warn("Wipe account data requested");
    const activeEmail = getActiveEmail();

    // Wipe the active account's database
    wipeDatabase();

    // Delete the active account's credentials and remove from registry
    if (activeEmail) {
      deleteCredentials();
      removeAccountEntry(activeEmail);
    }

    const remaining = listAccounts();
    if (remaining.length > 0) {
      // Other accounts exist — switch to the next one
      setImmediate(() => { app.relaunch(); app.exit(0); });
      return { willRelaunch: true };
    } else {
      // No accounts left — wipe license; renderer will navigate to onboarding
      deleteLicense();
      return { willRelaunch: false };
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
