import log from "electron-log/main";
import { readFileSync } from "fs";

// File transport: info+ (error, warn, info all written)
log.transports.file.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB

// Console transport: debug in dev, info in prod.
// Use NODE_ENV (set by electron-vite) instead of app.isPackaged so this module
// is safe to import from worker threads, where app is not available at load time.
log.transports.console.level = process.env.NODE_ENV !== "production" ? "debug" : "info";

// Scoped loggers
export const appLog = log.scope("app");
export const syncLog = log.scope("sync");
export const authLog = log.scope("auth");
export const licenseLog = log.scope("license");
export const dataLog = log.scope("data");
export const actionLog = log.scope("action");
export const dbLog = log.scope("db");

export function getLogPath(): string {
  return log.transports.file.getFile().path;
}

export function readLogFile(): string {
  try {
    return readFileSync(getLogPath(), "utf-8");
  } catch {
    return "";
  }
}

export default log;
