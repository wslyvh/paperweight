import { workerData, parentPort } from "node:worker_threads";
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
  enforcementDbPath,
  credentials,
  licensed,
  mode,
} = workerData as {
  dbPath: string;
  companiesDbPath: string;
  breachesDbPath: string;
  enforcementDbPath: string;
  credentials: StoredCredentials | null;
  licensed: boolean;
  mode: "sync" | "profile-analysis";
};

// Initialize before any module calls getDb() or loadCredentials()
initDb(dbPath, companiesDbPath, breachesDbPath, enforcementDbPath);
setPreloadedCredentials(credentials);

setProgressEmitter((status: SyncStatus) => {
  parentPort!.postMessage({ type: "progress", status });
});

const run =
  mode === "profile-analysis"
    ? () => runAnalysisPass()
    : () => runSync(licensed);

run()
  .then(() => parentPort!.postMessage({ type: "done" }))
  .catch((err: Error) => parentPort!.postMessage({ type: "error", message: err.message }));
