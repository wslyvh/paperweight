import { BrowserWindow, app } from "electron";
import { is } from "@electron-toolkit/utils";
import { join } from "path";
import { Worker } from "node:worker_threads";
import { IPC } from "@shared/ipc";
import { loadCredentials, getActiveEmail, emailToFileKey, listAccounts, accountTag } from "./credentials";
import { getLicenseStatus } from "./services/settings";
import log, { syncLog } from "./utils/log";
import type { SyncStatus } from "@shared/types";

const workers = new Map<string, Worker>();
const statuses = new Map<string, SyncStatus>();

const idleStatus = (): SyncStatus => ({ running: false, progress: 0, total: 0, message: "" });

export function getSyncStatus(email?: string): SyncStatus {
  const key = email ?? getActiveEmail() ?? "";
  return statuses.get(key) ?? idleStatus();
}

export function stopSync(email?: string): void {
  const key = email ?? getActiveEmail() ?? "";
  const worker = workers.get(key);
  if (worker) {
    worker.terminate();
    workers.delete(key);
  }
  statuses.set(key, idleStatus());
}

export function stopAllSyncs(): void {
  for (const [email] of workers) {
    stopSync(email);
  }
}

export function startSync(email?: string): void {
  const key = email ?? getActiveEmail() ?? "";
  if (!key) return;
  if (workers.has(key)) return; // already running for this account

  const credentials = loadCredentials(key) ?? null;
  if (!credentials) return; // account has no credentials yet

  const dbPath = join(app.getPath("userData"), `${emailToFileKey(key)}.db`);
  const companiesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
  const breachesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
  const licensed = getLicenseStatus().active;
  syncLog.info(`[${accountTag(key)}] Sync starting — ${licensed ? "licensed" : "incremental only (no license)"}`);

  const workerPath = join(__dirname, "sync-worker.js");
  const worker = new Worker(workerPath, {
    workerData: { dbPath, companiesDbPath, breachesDbPath, credentials, licensed },
  });

  workers.set(key, worker);

  worker.on(
    "message",
    (msg: {
      type: string;
      status?: SyncStatus;
      scope?: string;
      level?: string;
      args?: unknown[];
    }) => {
      if (msg.type === "log" && msg.scope && msg.level && msg.args) {
        const level = msg.level as "debug" | "info" | "warn" | "error" | "verbose";
        log.scope(msg.scope)[level](`[${accountTag(key)}]`, ...(msg.args as unknown[]));
        return;
      }
      if (msg.type === "progress" && msg.status) {
        statuses.set(key, msg.status);
        // Only broadcast to renderer for the currently active account
        if (key === getActiveEmail()) {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC.syncProgress, msg.status);
          }
        }
      }
    },
  );

  worker.on("error", (err: Error) => {
    syncLog.error(`Sync worker error [${accountTag(key)}]:`, err.stack ?? err.message);
    statuses.set(key, {
      running: false,
      progress: 0,
      total: 0,
      message: "Sync failed",
      error: err.message,
    });
    workers.delete(key);
  });

  worker.on("exit", (code) => {
    if (code !== 0) syncLog.error(`Sync worker exited with code: ${code} [${accountTag(key)}]`);
    workers.delete(key);
  });
}

export function startAllSyncs(): void {
  for (const acc of listAccounts()) {
    startSync(acc.email);
  }
}
