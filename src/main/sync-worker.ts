import { workerData, parentPort } from "node:worker_threads";
import { setDatabaseKey, type DatabaseKeyContext } from "./databaseEncryption";
import { initDb } from "./db";
import { setPreloadedCredentials } from "./credentials";
import { runAnalysisPass } from "./services/analysis";
import { setProgressEmitter, runSync } from "./services/sync";
import type { StoredCredentials } from "./credentials";
import type { SyncStatus } from "@shared/types";

const {
  dbPath,
  companiesDbPath,
  breachesDbPath,
  credentials,
  databaseKey,
  mode,
} = workerData as {
  dbPath: string;
  companiesDbPath: string;
  breachesDbPath: string;
  credentials: StoredCredentials | null;
  databaseKey: DatabaseKeyContext;
  mode: "sync" | "profile-analysis";
};

// Initialize before any module calls getDb() or loadCredentials()
setDatabaseKey(databaseKey);
initDb(dbPath, companiesDbPath, breachesDbPath);
let credentialRequestId = 0;
setPreloadedCredentials(credentials, (updated) => new Promise<void>((resolve, reject) => {
  const requestId = ++credentialRequestId;
  const onMessage = (message: { type: string; requestId?: number; error?: string }) => {
    if (message.type !== "credentials-saved" || message.requestId !== requestId) return;
    parentPort!.off("message", onMessage);
    if (message.error) reject(new Error(message.error));
    else resolve();
  };
  parentPort!.on("message", onMessage);
  parentPort!.postMessage({ type: "credentials", requestId, credentials: updated });
}));

setProgressEmitter((status: SyncStatus) => {
  parentPort!.postMessage({ type: "progress", status });
});

const run =
  mode === "profile-analysis"
    ? () => runAnalysisPass()
    : () => runSync();

run()
  .then(() => parentPort!.postMessage({ type: "done" }))
  .catch((err: Error) => parentPort!.postMessage({ type: "error", message: err.message }));
