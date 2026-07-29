import { BrowserWindow, app } from "electron";
import { is } from "@electron-toolkit/utils";
import { existsSync } from "fs";
import { join } from "path";
import { Worker } from "node:worker_threads";
import { IPC } from "@shared/ipc";
import {
  loadCredentials,
  getActiveEmail,
  emailToFileKey,
  listAccounts,
  accountTag,
} from "./credentials";
import {
  invalidateAllAnalysisPasses,
  invalidateAnalysisPassAtPath,
  needsAnalysisPass,
} from "./services/analysis";
import { getLicenseStatus } from "./services/settings";
import log, { syncLog } from "./utils/log";
import type { SyncStatus } from "@shared/types";

type WorkerMode = "sync" | "profile-analysis";

const workers = new Map<string, Worker>();
const workerModes = new WeakMap<Worker, WorkerMode>();
const workerProfileGenerations = new WeakMap<Worker, number>();
const terminatingWorkers = new WeakSet<Worker>();
const statuses = new Map<string, SyncStatus>();
const pendingAnalysis = new Set<string>();
const profileBaseStatuses = new Map<string, SyncStatus>();
let activeAnalysisAccount: string | undefined;
let profileGeneration = 0;

const idleStatus = (): SyncStatus => ({
  running: false,
  progress: 0,
  total: 0,
  message: "",
});

function accountDbPath(key: string): string {
  return join(app.getPath("userData"), `${emailToFileKey(key)}.db`);
}

function broadcastStatus(key: string, status: SyncStatus): void {
  statuses.set(key, status);
  if (key !== getActiveEmail()) return;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.syncProgress, status);
  }
}

function withPending(
  status: SyncStatus,
  analysisPending: boolean,
): SyncStatus {
  return { ...status, analysisPending };
}

function accountNeedsAnalysis(key: string): boolean {
  try {
    return needsAnalysisPass(accountDbPath(key));
  } catch {
    syncLog.warn(
      `Could not inspect pending analysis [${accountTag(key)}]`,
    );
    return statuses.get(key)?.analysisPending ?? false;
  }
}

function invalidateAccountAfterWorker(key: string): void {
  try {
    invalidateAnalysisPassAtPath(accountDbPath(key));
  } catch {
    syncLog.warn(
      `Could not renew profile analysis invalidation [${accountTag(key)}]`,
    );
  }
}

export function getSyncStatus(email?: string): SyncStatus {
  const key = email ?? getActiveEmail() ?? "";
  const status = statuses.get(key) ?? idleStatus();
  if (
    key
    && !status.running
    && !status.analysisPending
    && accountNeedsAnalysis(key)
  ) {
    return withPending(status, true);
  }
  return status;
}

export async function stopSync(email?: string): Promise<void> {
  const key = email ?? getActiveEmail() ?? "";
  pendingAnalysis.delete(key);
  profileBaseStatuses.delete(key);

  const worker = workers.get(key);
  if (worker) {
    terminatingWorkers.add(worker);
    await worker.terminate();
    if (workers.get(key) === worker) workers.delete(key);
    if (activeAnalysisAccount === key) activeAnalysisAccount = undefined;
  }
  broadcastStatus(key, idleStatus());
}

export async function stopAllSyncs(): Promise<void> {
  pendingAnalysis.clear();
  profileBaseStatuses.clear();
  await Promise.all([...workers.keys()].map((email) => stopSync(email)));
  activeAnalysisAccount = undefined;
}

function startNextAnalysis(): void {
  if (activeAnalysisAccount) return;

  const activeEmail = getActiveEmail();
  const activeWorker = activeEmail ? workers.get(activeEmail) : undefined;
  if (
    activeWorker
    && workerModes.get(activeWorker) === "sync"
  ) {
    return;
  }

  const keys = [...pendingAnalysis];
  if (activeEmail && pendingAnalysis.has(activeEmail)) {
    keys.splice(keys.indexOf(activeEmail), 1);
    keys.unshift(activeEmail);
  }

  for (const key of keys) {
    if (workers.has(key)) continue;
    pendingAnalysis.delete(key);

    if (!accountNeedsAnalysis(key)) {
      const status = withPending(statuses.get(key) ?? idleStatus(), false);
      broadcastStatus(key, status);
      continue;
    }

    if (startWorker(key, "profile-analysis")) return;
  }
}

function startWorker(key: string, mode: WorkerMode): boolean {
  if (workers.has(key)) return false;
  if (mode === "profile-analysis" && activeAnalysisAccount) return false;

  const dbPath = accountDbPath(key);
  if (mode === "profile-analysis" && !existsSync(dbPath)) return false;

  const credentials = mode === "sync" ? loadCredentials(key) ?? null : null;
  if (mode === "sync" && !credentials) return false;

  const companiesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
  const breachesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
  const enforcementDbPath = is.dev
    ? join(app.getAppPath(), "resources", "enforcement.db")
    : join(process.resourcesPath, "enforcement.db");
  const licensed = mode === "sync" && getLicenseStatus().active;

  if (mode === "sync") {
    syncLog.info(
      `[${accountTag(key)}] Refresh starting — ${
        licensed ? "licensed" : "incremental only (no license)"
      }`,
    );
  } else {
    syncLog.info(`[${accountTag(key)}] Message analysis starting`);
    activeAnalysisAccount = key;
    const baseStatus = statuses.get(key) ?? idleStatus();
    profileBaseStatuses.set(key, baseStatus);
    broadcastStatus(key, {
      ...baseStatus,
      running: true,
      progress: 0,
      total: 0,
      message: "Analyzing messages",
      analysisPending: true,
    });
  }

  const workerPath = join(__dirname, "sync-worker.js");
  const worker = new Worker(workerPath, {
    workerData: {
      dbPath,
      companiesDbPath,
      breachesDbPath,
      enforcementDbPath,
      credentials,
      licensed,
      mode,
    },
  });

  workers.set(key, worker);
  workerModes.set(worker, mode);
  workerProfileGenerations.set(worker, profileGeneration);
  let reportedError: string | undefined;
  let completed = false;
  let finalStatus: SyncStatus | undefined;

  worker.on(
    "message",
    (msg: {
      type: string;
      status?: SyncStatus;
      scope?: string;
      level?: string;
      args?: unknown[];
      message?: string;
    }) => {
      if (msg.type === "log" && msg.scope && msg.level && msg.args) {
        const level = msg.level as "debug" | "info" | "warn" | "error" | "verbose";
        log.scope(msg.scope)[level](
          `[${accountTag(key)}]`,
          ...(msg.args as unknown[]),
        );
        return;
      }
      if (msg.type === "progress" && msg.status) {
        const nextStatus = statuses.get(key)?.analysisPending
          ? withPending(msg.status, true)
          : msg.status;
        if (mode === "sync" && !msg.status.running) {
          finalStatus = nextStatus;
          statuses.set(key, nextStatus);
        } else {
          broadcastStatus(key, nextStatus);
        }
        return;
      }
      if (msg.type === "error") {
        reportedError = msg.message ?? "Worker failed";
      }
      if (msg.type === "done") completed = true;
    },
  );

  worker.on("error", (err: Error) => {
    syncLog.error(
      `Refresh worker error [${accountTag(key)}]:`,
      err.stack ?? err.message,
    );
    reportedError = err.message;
  });

  worker.on("exit", (code) => {
    const terminated = terminatingWorkers.has(worker);
    const workerGeneration =
      workerProfileGenerations.get(worker) ?? profileGeneration;
    if (code !== 0 && !terminated) {
      syncLog.error(
        `Refresh worker exited with code: ${code} [${accountTag(key)}]`,
      );
    }
    if (workers.get(key) !== worker) return;
    workers.delete(key);

    if (mode === "profile-analysis") {
      if (activeAnalysisAccount === key) activeAnalysisAccount = undefined;
      const baseStatus = profileBaseStatuses.get(key) ?? idleStatus();
      profileBaseStatuses.delete(key);
      if (workerGeneration !== profileGeneration) {
        invalidateAccountAfterWorker(key);
        broadcastStatus(key, withPending(baseStatus, true));
        return;
      }
      if (terminated) return;

      const succeeded =
        completed
        && !reportedError
        && code === 0;
      const stillPending = !succeeded || accountNeedsAnalysis(key);
      if (!succeeded) {
        syncLog.error(`Message analysis failed [${accountTag(key)}]`);
      }
      broadcastStatus(key, withPending(baseStatus, stillPending));
      startNextAnalysis();
      return;
    }

    if (terminated) return;

    let baseStatus = finalStatus ?? statuses.get(key) ?? idleStatus();
    if (
      reportedError
      || code !== 0
      || !completed
    ) {
      baseStatus = {
        running: false,
        progress: 0,
        total: 0,
        message: "Sync failed",
        error: reportedError ?? "Sync failed",
        analysisPending: baseStatus.analysisPending,
      };
    }

    if (workerGeneration !== profileGeneration) {
      // This sync used the previous profile snapshot and may have stamped rows
      // after the profile mutation invalidated them. Renew only this account's
      // marker, then wait for a later Refresh as requested by the user.
      invalidateAccountAfterWorker(key);
      broadcastStatus(key, withPending(baseStatus, true));
      return;
    }

    if (!accountNeedsAnalysis(key)) {
      broadcastStatus(key, withPending(baseStatus, false));
      startNextAnalysis();
      return;
    }

    pendingAnalysis.add(key);
    statuses.set(key, withPending(baseStatus, true));
    startNextAnalysis();
    if (activeAnalysisAccount !== key) {
      broadcastStatus(key, withPending(baseStatus, true));
    }
  });

  return true;
}

function startSync(email?: string): void {
  const key = email ?? getActiveEmail() ?? "";
  if (!key) return;
  startWorker(key, "sync");
}

export function startAllSyncs(): void {
  const accounts = listAccounts();
  const activeEmail = getActiveEmail();
  const ordered = activeEmail
    ? [
        ...accounts.filter((account) => account.email === activeEmail),
        ...accounts.filter((account) => account.email !== activeEmail),
      ]
    : accounts;

  for (const account of ordered) {
    startSync(account.email);
  }

  // Missing credentials must not prevent a local, already-marked analysis pass.
  for (const account of ordered) {
    if (
      !workers.has(account.email)
      && accountNeedsAnalysis(account.email)
    ) {
      pendingAnalysis.add(account.email);
      statuses.set(
        account.email,
        withPending(statuses.get(account.email) ?? idleStatus(), true),
      );
    }
  }
  startNextAnalysis();
}

export function markProfileAnalysisStale(): void {
  const accounts = listAccounts();
  if (accounts.length === 0) return;

  profileGeneration++;
  pendingAnalysis.clear();
  invalidateAllAnalysisPasses();

  for (const account of accounts) {
    broadcastStatus(
      account.email,
      withPending(statuses.get(account.email) ?? idleStatus(), true),
    );
  }

  // An analysis already using the previous profile must not stamp its results
  // current after this mutation. Stop it, then its exit handler renews the
  // durable marker. Normal provider syncs are allowed to finish and do the same.
  for (const worker of workers.values()) {
    if (workerModes.get(worker) !== "profile-analysis") continue;
    terminatingWorkers.add(worker);
    void worker.terminate().catch(() => {
      syncLog.error("Could not stop superseded message analysis");
    });
  }
}
