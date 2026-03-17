import { app, ipcMain } from "electron";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc";
import { APP_CONFIG } from "@shared/config";
import { isIntInRange, isString } from "@shared/validation";
import type { ImapConfig, SupportInfo, MessageType } from "@shared/types";
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
} from "../services/account";
import { clearSyncData, getSyncState } from "../services/sync";
import { startSync, getSyncStatus } from "../sync-manager";
import { getLicenseStatus, deleteLicense } from "../services/settings";
import { getDashboardStats } from "../services/stats";
import { deleteCredentials, loadCredentials } from "../credentials";
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
    const dbPath = join(app.getPath("userData"), `${APP_CONFIG.DOMAIN}.db`);
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

  ipcMain.handle(IPC.clearSyncData, () => {
    dataLog.warn("Clear sync data requested");
    clearSyncData();
  });

  ipcMain.handle(IPC.wipeData, () => {
    dataLog.warn("Wipe all data requested");
    wipeDatabase();
    deleteCredentials();
    deleteLicense();
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
