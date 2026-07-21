import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import { statSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { listAccounts, emailToFileKey } from "../credentials";
import type { StorageAccount, StorageBreakdown } from "@shared/types";

// SQLite keeps its write-ahead log and shared-memory index alongside the db.
const DB_SIDECAR_SUFFIXES = ["", "-wal", "-shm"];

// Chromium/Electron cache directories under userData — all reclaimable, none
// of it is user data. These names are stable Chromium conventions.
const CACHE_DIRS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "Shared Dictionary",
  "blob_storage",
];

function fileBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Recursively sum sizes of all regular files under dir. Symlinks and unreadable entries count as 0. */
function dirBytes(dir: string): number {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += dirBytes(full);
    else if (entry.isFile()) total += fileBytes(full);
  }
  return total;
}

/** Total on-disk size of one account's SQLite db, including -wal/-shm sidecars. */
export function accountDbBytes(email: string): number {
  const base = join(app.getPath("userData"), `${emailToFileKey(email)}.db`);
  return DB_SIDECAR_SUFFIXES.reduce((sum, suffix) => sum + fileBytes(base + suffix), 0);
}

export function getStorageBreakdown(): StorageBreakdown {
  const userData = app.getPath("userData");
  const logsPath = app.getPath("logs");

  const accounts: StorageAccount[] = listAccounts().map((a) => ({
    email: a.email,
    sizeBytes: accountDbBytes(a.email),
  }));
  const accountsTotalBytes = accounts.reduce((sum, a) => sum + a.sizeBytes, 0);

  const cacheBytes = CACHE_DIRS.reduce((sum, dir) => sum + dirBytes(join(userData, dir)), 0);
  const logsBytes = dirBytes(logsPath);

  // App data = the persistent, non-cache remainder of userData (settings,
  // credentials, Local Storage, IndexedDB, ...). Subtract the buckets already
  // counted; only subtract logs when the OS keeps them inside userData (Linux/
  // Windows do, macOS keeps them under ~/Library/Logs).
  const logsInsideUserData = logsPath.startsWith(userData);
  const appDataBytes = Math.max(
    0,
    dirBytes(userData) - accountsTotalBytes - cacheBytes - (logsInsideUserData ? logsBytes : 0),
  );

  // App resources = the bundled asar + reference DBs today, embedded models
  // later — the part of the install that grows with our own changes. In dev it
  // lives under the project's resources/; packaged, it's process.resourcesPath
  // (walking the tree reads the Linux AppImage squashfs uncompressed rather than
  // statting the compressed image).
  const resourcesPath = is.dev ? join(app.getAppPath(), "resources") : process.resourcesPath;
  const resourcesBytes = dirBytes(resourcesPath);

  // Runtime = the private Electron/Chromium framework every packaged Electron
  // app bundles (a fixed baseline, freed only on uninstall). It sits one level
  // up from resources/ on all three platforms, so measure the whole install
  // payload and subtract resources. Not meaningful in an unpackaged dev run.
  const installPayloadBytes = is.dev ? resourcesBytes : dirBytes(dirname(resourcesPath));
  const runtimeBytes = Math.max(0, installPayloadBytes - resourcesBytes);

  return {
    accounts,
    accountsTotalBytes,
    cacheBytes,
    logsBytes,
    appDataBytes,
    resourcesBytes,
    runtimeBytes,
    totalBytes:
      accountsTotalBytes + cacheBytes + logsBytes + appDataBytes + resourcesBytes + runtimeBytes,
  };
}
