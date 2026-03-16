import { BrowserWindow, app } from "electron";
import { is } from "@electron-toolkit/utils";
import { join } from "path";
import { Worker } from "node:worker_threads";
import { IPC } from "@shared/ipc";
import { loadCredentials, getActiveEmail, sanitizeEmail } from "./credentials";
import { getLicenseStatus } from "./services/settings";
import { APP_CONFIG } from "@shared/config";
import { syncLog } from "./utils/log";
import { appendFileLog } from "./utils/file-log";
import type { SyncStatus } from "@shared/types";

let activeWorker: Worker | undefined;
let lastStatus: SyncStatus = {
  running: false,
  progress: 0,
  total: 0,
  message: "",
};

export function getSyncStatus(): SyncStatus {
  return lastStatus;
}

export function startSync(): void {
  if (activeWorker) return; // already running

  const activeEmail = getActiveEmail();
  const dbName = activeEmail ? `${sanitizeEmail(activeEmail)}.db` : `${APP_CONFIG.DOMAIN}.db`;
  const dbPath = join(app.getPath("userData"), dbName);
  const companiesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
  const breachesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
  const credentials = loadCredentials() ?? null;
  const licenseStatus = getLicenseStatus();
  const licensed = licenseStatus.active;

  const workerPath = join(__dirname, "sync-worker.js");
  activeWorker = new Worker(workerPath, {
    workerData: {
      dbPath,
      companiesDbPath,
      breachesDbPath,
      credentials,
      licensed,
    },
  });

  activeWorker.on(
    "message",
    (msg: {
      type: string;
      status?: SyncStatus;
      scope?: string;
      level?: string;
      args?: unknown[];
    }) => {
      if (msg.type === "log" && msg.scope && msg.level && msg.args) {
        appendFileLog(msg.level, msg.scope, ...msg.args);
        return;
      }
      if (msg.type === "progress" && msg.status) {
        lastStatus = msg.status;
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.syncProgress, msg.status);
        }
      }
    },
  );

  activeWorker.on("error", (err: Error) => {
    syncLog.error("Sync worker error:", err.stack ?? err.message);
    lastStatus = {
      running: false,
      progress: 0,
      total: 0,
      message: "Sync failed",
      error: err.message,
    };
    activeWorker = undefined;
  });

  activeWorker.on("exit", (code) => {
    if (code !== 0) syncLog.error(`Sync worker exited with code: ${code}`);
    activeWorker = undefined;
  });
}
