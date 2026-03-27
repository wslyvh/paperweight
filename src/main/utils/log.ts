import { parentPort } from "node:worker_threads";

// Worker threads don't have access to 'electron' — electron-log requires it at load time.
// Relay all log messages to the main process, which logs them with the account-tagged scope.
function createWorkerLogger() {
  const relay = (scope: string, level: string, args: unknown[]) => {
    if (parentPort) {
      try {
        parentPort.postMessage({ type: "log", scope, level, args });
      } catch {
        // ignore if worker not connected
      }
    }
  };
  const createScope = (name: string) => ({
    debug: (...args: unknown[]) => relay(name, "debug", args),
    info: (...args: unknown[]) => relay(name, "info", args),
    warn: (...args: unknown[]) => relay(name, "warn", args),
    error: (...args: unknown[]) => relay(name, "error", args),
    verbose: (...args: unknown[]) => relay(name, "verbose", args),
  });
  return {
    scope: createScope,
    transports: { file: { getFile: () => ({ path: "" }) } },
  };
}

let log:
  | ReturnType<typeof createWorkerLogger>
  | import("electron-log").MainLogger;

if (parentPort !== null) {
  log = createWorkerLogger();
} else {
  const electronLog = require("electron-log/main").default;
  electronLog.transports.file.level = "info";
  electronLog.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
  electronLog.transports.console.level =
    process.env.NODE_ENV !== "production" ? "debug" : "info";
  log = electronLog;
}

// Scoped loggers
export const appLog = log.scope("app");
export const syncLog = log.scope("sync");
export const authLog = log.scope("auth");
export const licenseLog = log.scope("license");
export const dataLog = log.scope("data");
export const actionLog = log.scope("action");
export const dbLog = log.scope("db");

export default log;
