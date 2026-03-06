/**
 * File logging utilities for the main process.
 * Used for direct writes (worker relay logs) and for providing the log path to IPC handlers.
 */

import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

let logPath: string | null = null;

export function initFileLog(path: string): void {
  logPath = path;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore
  }
}

export function getFileLogPath(): string {
  return logPath ?? "";
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a)))
    .join(" ");
}

function formatLine(level: string, scope: string, text: string): string {
  const now = new Date();
  const p = (n: number, len = 2): string => String(n).padStart(len, "0");
  const ts = `[${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}.${p(now.getMilliseconds(), 3)}]`;
  const lvl = `[${level.toLowerCase()}]`.padEnd(7);
  const sc = `(${scope})`.padEnd(10);
  return `${ts} ${lvl} ${sc}${text}\n`;
}

export function appendFileLog(level: string, scope: string, ...args: unknown[]): void {
  if (!logPath) return;
  try {
    const line = formatLine(level, scope, formatArgs(args));
    appendFileSync(logPath, line, "utf-8");
  } catch {
    // ignore write failures
  }
}
